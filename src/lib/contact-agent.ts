import {
  dbFindContactsByNameOrPhone,
  dbGetContactBuckets,
  dbFindBucketByName,
  dbGetContactBucketById,
  dbCreateUserPendingAction,
  dbGetPendingUserAction,
  dbUpdateUserActionStatus,
  ContactBucket,
} from "./db";
import { sendWhatsAppMessage } from "./whatsapp-gateway";

export interface ContactAgentTurnResult {
  handled: boolean;
  reply: string;
}

/**
 * Handles owner commands to search contacts, disambiguate names, stage messages,
 * and dispatch broadcasts to contact buckets or specific recipients.
 */
export async function handleOwnerContactOrBucketTurn(params: {
  workspaceId: string;
  instanceName: string;
  userPhone: string;
  userText: string;
  historyText?: string;
  ownerName?: string;
}): Promise<ContactAgentTurnResult> {
  const { workspaceId, instanceName, userPhone, userText, historyText = "", ownerName = "Boss" } = params;
  const lower = userText.toLowerCase().trim();

  // -------------------------------------------------------------
  // 1. Pending Action Confirmation / Rejection (YES / NO / 1 / CANCEL)
  // -------------------------------------------------------------
  const pendingAction = await dbGetPendingUserAction(userPhone);

  const isAffirmative = /^(yes|yeah|yep|y|proceed|send|dispatch|deliver|ok|okay|1|sure|confirm)$/i.test(lower);
  const isNegative = /^(no|nah|cancel|stop|abort|don't|dont|0)$/i.test(lower);

  if (pendingAction && (isAffirmative || isNegative)) {
    if (isNegative) {
      await dbUpdateUserActionStatus(pendingAction.id, "cancelled");
      return {
        handled: true,
        reply: `❌ *Cancelled.* The message was not sent, ${ownerName}. What else can I help you with?`,
      };
    }

    if (isAffirmative) {
      // Execute pending action!
      if (pendingAction.action_type === "whatsapp_message") {
        const res = await sendWhatsAppMessage(pendingAction.payload, pendingAction.target_recipient, instanceName);
        if (res.success) {
          await dbUpdateUserActionStatus(pendingAction.id, "executed");
          return {
            handled: true,
            reply: `✅ *Message Dispatched!*\n\nI have successfully sent your message to *+${pendingAction.target_recipient}*.`,
          };
        } else {
          await dbUpdateUserActionStatus(pendingAction.id, "failed");
          return {
            handled: true,
            reply: `⚠️ *Delivery Failed:* ${res.error || "Evolution gateway error"}. Please check your connection in Control Room.`,
          };
        }
      }

      // Broadcast to Contact Bucket
      if (pendingAction.action_type === ("broadcast_bucket" as any)) {
        const bucket = await dbGetContactBucketById(pendingAction.target_recipient);
        if (!bucket || !bucket.contact_phones || bucket.contact_phones.length === 0) {
          await dbUpdateUserActionStatus(pendingAction.id, "failed");
          return {
            handled: true,
            reply: `⚠️ *Broadcast Failed:* Bucket has no contacts or was removed.`,
          };
        }

        let sentCount = 0;
        for (const phone of bucket.contact_phones) {
          try {
            const res = await sendWhatsAppMessage(pendingAction.payload, phone, instanceName);
            if (res.success) sentCount++;
          } catch {}
        }

        await dbUpdateUserActionStatus(pendingAction.id, "executed");
        return {
          handled: true,
          reply: `✅ *Broadcast Delivered!* 🚀\n\nSuccessfully sent your message to *${sentCount}* contact(s) in *${bucket.name}*.`,
        };
      }
    }
  }

  // -------------------------------------------------------------
  // 2. Bucket Listing Commands ("list buckets", "my buckets", "bucket list")
  // -------------------------------------------------------------
  const isBucketListQuery =
    /^(list buckets|my buckets|show buckets|bucket list|what buckets do i have|view buckets)$/i.test(lower);

  if (isBucketListQuery) {
    const buckets = await dbGetContactBuckets(workspaceId);
    if (buckets.length === 0) {
      return {
        handled: true,
        reply: `📦 *Contact Buckets for your business:*\n\nYou don't have any contact buckets created yet.\n\n💡 You can create buckets in your Control Room or save selected contacts into a bucket anytime!`,
      };
    }

    const bucketItems = buckets
      .map((b, i) => `${i + 1}. *${b.name}* — ${b.contact_phones.length} contact(s)`)
      .join("\n");

    return {
      handled: true,
      reply: `📦 *Your Saved Contact Buckets:*\n\n${bucketItems}\n\n💡 To deliver a message, just tell me:\n\`deliver this message to ${buckets[0].name}: [your message]\``,
    };
  }

  // -------------------------------------------------------------
  // 3. Bucket Delivery Commands ("deliver this message to bucket 1", "send to bucket 1: ...")
  // -------------------------------------------------------------
  const bucketMatch = userText.match(
    /(?:deliver\s+(?:this\s+)?message\s+to|send\s+(?:this\s+)?(?:message\s+)?to|broadcast\s+to|message)\s+(?:bucket\s+list\s+|bucket\s+)([a-zA-Z0-9_\-\s]+?)(?::|\s+saying\s+|\s+with\s+message\s+|\s+content:\s*|$)/i
  );

  if (bucketMatch) {
    const rawBucketIdentifier = bucketMatch[1].trim();
    // Resolve bucket by name e.g. "1" -> "Bucket 1", or exact name
    const allBuckets = await dbGetContactBuckets(workspaceId);
    let matchedBucket: ContactBucket | null | undefined = allBuckets.find(
      (b) =>
        b.name.toLowerCase() === rawBucketIdentifier.toLowerCase() ||
        b.name.toLowerCase() === `bucket ${rawBucketIdentifier.toLowerCase()}` ||
        b.id.toLowerCase() === rawBucketIdentifier.toLowerCase()
    );

    if (!matchedBucket && /^\d+$/.test(rawBucketIdentifier)) {
      const idx = parseInt(rawBucketIdentifier, 10) - 1;
      if (allBuckets[idx]) matchedBucket = allBuckets[idx];
    }

    if (!matchedBucket) {
      matchedBucket = await dbFindBucketByName(workspaceId, rawBucketIdentifier);
    }

    if (!matchedBucket) {
      const available = allBuckets.map((b) => `• *${b.name}* (${b.contact_phones.length} contacts)`).join("\n");
      return {
        handled: true,
        reply: `⚠️ ${ownerName}, I couldn't find a bucket named "*${rawBucketIdentifier}*".\n\nYour available buckets are:\n${
          available || "No buckets created yet."
        }\n\nWhich bucket would you like to use?`,
      };
    }

    // Extract message content if present
    let messageToDeliver = "";
    const colonIdx = userText.indexOf(":");
    if (colonIdx !== -1 && colonIdx < userText.length - 1) {
      messageToDeliver = userText.slice(colonIdx + 1).trim();
    } else {
      const afterMatch = userText.slice(userText.indexOf(bucketMatch[0]) + bucketMatch[0].length).trim();
      if (afterMatch && afterMatch.length > 3) {
        messageToDeliver = afterMatch;
      }
    }

    if (!messageToDeliver) {
      return {
        handled: true,
        reply: `📦 Found *${matchedBucket.name}* with ${matchedBucket.contact_phones.length} contact(s).\n\nWhat message would you like me to deliver to them, ${ownerName}?`,
      };
    }

    // Stage pending approval for bucket broadcast
    await dbCreateUserPendingAction({
      userIdentifier: userPhone,
      actionType: "broadcast_bucket" as any,
      targetRecipient: matchedBucket.id,
      subject: matchedBucket.name,
      payload: messageToDeliver,
    });

    return {
      handled: true,
      reply:
        `📦 *Ready to Deliver to Bucket "${matchedBucket.name}" (${matchedBucket.contact_phones.length} contacts):*\n\n` +
        `"${messageToDeliver}"\n\n` +
        `👉 Reply *YES* to dispatch this broadcast to all ${matchedBucket.contact_phones.length} contacts right now, or *NO* to cancel.`,
    };
  }

  // -------------------------------------------------------------
  // 4. Contact Name Search & Messaging ("help me message Femi", "message Chioma and Tunde")
  // -------------------------------------------------------------
  // Strict guard: if the user is discussing automations, workflows, integrations, creative assets, prompts, code, images, video, n8n, or asking for plain text, DO NOT treat as contact outreach!
  const isCreativeOrTechnical =
    /\b(automation|pipeline|workflow|n8n|bot|chatbot|webhook|integration|paystack|airtable|supabase|sheets|google\s+sheets|stripe|crm|database|api|endpoint|auto-responder|invoice|prompt|image|video|clip|script|code|json|scene|story|artifact|document|file|audio|voice\s+note|html|css|preview|link)\b/i.test(userText) ||
    /\b(i want an automation|build an automation|create an automation|automate|when someone pays|when a user|records the transaction)\b/i.test(userText) ||
    /\b(want\s+text|plain\s+text|raw\s+text|text\s+prompt|body\s+text|some\s+text)\b/i.test(userText);

  const messageContactTrigger = !isCreativeOrTechnical
    ? userText.match(
        /(?:^|\b)(?:help\s+me\s+(?:message|text)|(?:send|deliver)\s+(?:a\s+)?(?:message|text)\s+to|\bmessage\s+|\btext\s+)\s*([^:.]+)/i
      )
    : null;

  if (messageContactTrigger) {
    const rawTargetsStr = messageContactTrigger[1].trim();

    // Check if the user is asking about status, broadcast, general pronouns, or business entities
    if (
      /^(status|broadcast|everyone|all|bucket|me|you|him|her|them|their|his|our|its|someone|person|people|number|customer|customers|client|clients|user|users|lead|leads|whatsapp|email|sms|group|now|later|first)/i.test(rawTargetsStr) ||
      isCreativeOrTechnical
    ) {
      return { handled: false, reply: "" };
    }

    // Extract message content if provided after colon or quotes
    let explicitMessage = "";
    const colonIdx = userText.indexOf(":");
    if (colonIdx !== -1 && colonIdx < userText.length - 1) {
      explicitMessage = userText.slice(colonIdx + 1).trim();
    }

    // Split multiple names separated by "and", "&", or ","
    const names = rawTargetsStr
      .split(/(?:\s+and\s+|\s*&\s*|\s*,\s*)/i)
      .map((n) => n.trim())
      .filter(
        (n) =>
          n.length > 1 &&
          n.length <= 25 &&
          !/^(him|her|them|their|his|our|its|someone|person|people|number|customer|customers|client|clients|user|users|lead|leads|whatsapp|email|sms|invoice)$/i.test(n)
      );

    if (names.length === 0) {
      return { handled: false, reply: "" };
    }

    const reportLines: string[] = [];
    const singleMatches: Array<{ name: string; phone: string; formattedPhone: string }> = [];

    for (const nameQuery of names) {
      const matches = await dbFindContactsByNameOrPhone({
        workspaceId,
        query: nameQuery,
        instanceName,
      });

      if (matches.length === 0) {
        reportLines.push(
          `🔍 *${nameQuery}:* No contacts found matching this name in your phone or CRM.`
        );
      } else if (matches.length === 1) {
        singleMatches.push(matches[0]);
        reportLines.push(
          `👤 *${matches[0].name}* (${matches[0].formattedPhone})`
        );
      } else {
        const formattedList = matches
          .slice(0, 5)
          .map((m, i) => `   ${i + 1}. *${m.name}* (${m.formattedPhone})`)
          .join("\n");
        reportLines.push(
          `🔍 Found *${matches.length}* contacts matching "*${nameQuery}*":\n${formattedList}`
        );
      }
    }

    // If single match found and message already provided
    if (names.length === 1 && singleMatches.length === 1 && explicitMessage) {
      const match = singleMatches[0];
      await dbCreateUserPendingAction({
        userIdentifier: userPhone,
        actionType: "whatsapp_message",
        targetRecipient: match.phone,
        payload: explicitMessage,
      });

      return {
        handled: true,
        reply:
          `📋 *Ready to Send to ${match.name} (${match.formattedPhone}):*\n\n` +
          `"${explicitMessage}"\n\n` +
          `👉 Reply *YES* to dispatch immediately, or *NO* to cancel.`,
      };
    }

    // If matches found, prompt the user to pick or specify what to deliver
    if (reportLines.length > 0) {
      const followUp = explicitMessage
        ? `\nPlease specify which number above to deliver your message to:`
        : `\nWhich one would you like me to message, and what should I deliver?`;

      return {
        handled: true,
        reply: `${reportLines.join("\n\n")}${followUp}`,
      };
    }
  }

  // -------------------------------------------------------------
  // 5. Handling Direct Number Selection (e.g. User replies "1" or gives number following a match)
  // -------------------------------------------------------------
  if (historyText && /found\s+\d+\s+contacts/i.test(historyText)) {
    const numberChoiceMatch = userText.match(/^(?:select\s+|number\s+|option\s+)?([1-5])(?::|\s+)?(.*)/i);
    if (numberChoiceMatch) {
      const choiceIdx = parseInt(numberChoiceMatch[1], 10);
      const remainingMsg = numberChoiceMatch[2] ? numberChoiceMatch[2].trim() : "";

      // Extract the phone numbers listed in historyText
      const phonesInHistory = historyText.match(/\(\+?(\d{10,14})\)/g);
      if (phonesInHistory && phonesInHistory[choiceIdx - 1]) {
        const cleanPhone = phonesInHistory[choiceIdx - 1].replace(/\D/g, "");

        if (remainingMsg) {
          await dbCreateUserPendingAction({
            userIdentifier: userPhone,
            actionType: "whatsapp_message",
            targetRecipient: cleanPhone,
            payload: remainingMsg,
          });

          return {
            handled: true,
            reply:
              `📋 *Ready to Send to +${cleanPhone}:*\n\n` +
              `"${remainingMsg}"\n\n` +
              `👉 Reply *YES* to dispatch immediately, or *NO* to cancel.`,
          };
        } else {
          return {
            handled: true,
            reply: `Selected contact (+${cleanPhone})! What message would you like me to deliver to them?`,
          };
        }
      }
    }
  }

  return { handled: false, reply: "" };
}

import {
  dbFindContactsByNameOrPhone,
  dbGetContactsOverview,
  dbGetContactBuckets,
  dbFindBucketByName,
  dbGetContactBucketById,
  dbCreateUserPendingAction,
  dbGetPendingUserAction,
  dbUpdateUserActionStatus,
  ContactBucket,
  ContactMatch,
} from "./db";
import { sendWhatsAppMessage, sendWhatsAppDocument } from "./whatsapp-gateway";

export interface ContactAgentTurnResult {
  handled: boolean;
  reply: string;
}

/**
 * Handles owner commands to search contacts, view contact book overview,
 * disambiguate names, stage messages, and dispatch broadcasts to contact buckets.
 */
export async function handleOwnerContactOrBucketTurn(params: {
  workspaceId: string;
  instanceName: string;
  userPhone: string;
  userText: string;
  historyText?: string;
  ownerName?: string;
  attachment?: {
    base64: string;
    mimetype: string;
    fileName: string;
  } | null;
}): Promise<ContactAgentTurnResult> {
  const { workspaceId, instanceName, userPhone, userText, historyText = "", ownerName = "Boss" } = params;
  const lower = userText.toLowerCase().trim();

  // -------------------------------------------------------------
  // 1. Pending Action Confirmation / Rejection (YES / NO / 1 / CANCEL)
  // -------------------------------------------------------------
  const pendingAction = await dbGetPendingUserAction(userPhone);

  const isAffirmative = /^(yes|yeah|yep|y|proceed|send|dispatch|deliver|ok|okay|sure|confirm)$/i.test(lower);
  const isNegative = /^(no|nah|cancel|stop|abort|don't|dont|0)$/i.test(lower);

  // 1a. Handle Recipient Disambiguation (e.g. Boss chooses 1, 2, 3 or specifies name)
  if (pendingAction && pendingAction.action_type === ("select_recipient" as any)) {
    if (isNegative) {
      await dbUpdateUserActionStatus(pendingAction.id, "cancelled");
      return {
        handled: true,
        reply: `❌ *Cancelled.* No document or message was dispatched, ${ownerName}.`,
      };
    }

    try {
      const data = JSON.parse(pendingAction.payload);
      const options: Array<{ name: string; phone: string; formattedPhone: string }> = data.options || [];
      let selectedOption: { name: string; phone: string; formattedPhone: string } | null = null;

      const numMatch = lower.match(/\b([1-9])\b/);
      if (numMatch) {
        const idx = parseInt(numMatch[1], 10) - 1;
        if (idx >= 0 && idx < options.length) {
          selectedOption = options[idx];
        }
      }

      if (!selectedOption) {
        for (const opt of options) {
          if (lower.includes(opt.name.toLowerCase()) || lower.includes(opt.phone.slice(-6))) {
            selectedOption = opt;
            break;
          }
        }
      }

      if (selectedOption) {
        if (data.attachment?.base64) {
          const sendRes = await sendWhatsAppDocument(
            data.attachment.base64,
            data.attachment.fileName || "Document.pdf",
            selectedOption.phone,
            data.attachment.caption || `📄 Attached from ${ownerName}`,
            data.attachment.mimetype || "application/pdf",
            instanceName
          );
          if (sendRes.success) {
            await dbUpdateUserActionStatus(pendingAction.id, "executed");
            return {
              handled: true,
              reply: `✅ *Document Dispatched!* 🚀\n\nI have successfully sent "${data.attachment.fileName}" to *${selectedOption.name}* (${selectedOption.formattedPhone}).`,
            };
          } else {
            await dbUpdateUserActionStatus(pendingAction.id, "failed");
            return {
              handled: true,
              reply: `⚠️ *Delivery Failed:* ${sendRes.error || "Evolution gateway error"}. Please check your connection in Control Room.`,
            };
          }
        } else if (data.textMessage) {
          const sendRes = await sendWhatsAppMessage(data.textMessage, selectedOption.phone, instanceName);
          if (sendRes.success) {
            await dbUpdateUserActionStatus(pendingAction.id, "executed");
            return {
              handled: true,
              reply: `✅ *Message Dispatched!* 🚀\n\nSuccessfully sent your message to *${selectedOption.name}* (${selectedOption.formattedPhone}).`,
            };
          }
        }
      }
    } catch (e: any) {
      console.warn("[Contact Agent] Disambiguation selection error:", e);
    }
  }

  // 1b. Standard YES / NO Confirmation
  if (pendingAction && (isAffirmative || isNegative)) {
    if (isNegative) {
      await dbUpdateUserActionStatus(pendingAction.id, "cancelled");
      return {
        handled: true,
        reply: `❌ *Cancelled.* The message was not sent, ${ownerName}. What else can I help you with?`,
      };
    }

    if (isAffirmative) {
      // Execute Document Dispatch
      if (pendingAction.action_type === ("whatsapp_document" as any)) {
        try {
          const data = JSON.parse(pendingAction.payload);
          const res = await sendWhatsAppDocument(
            data.base64,
            data.fileName || "Document.pdf",
            pendingAction.target_recipient,
            data.caption || `📄 Attached from ${ownerName}`,
            data.mimetype || "application/pdf",
            instanceName
          );
          if (res.success) {
            await dbUpdateUserActionStatus(pendingAction.id, "executed");
            return {
              handled: true,
              reply: `✅ *Document Dispatched!* 🚀\n\nI have successfully sent "${data.fileName}" to *+${pendingAction.target_recipient}*.`,
            };
          } else {
            await dbUpdateUserActionStatus(pendingAction.id, "failed");
            return {
              handled: true,
              reply: `⚠️ *Delivery Failed:* ${res.error || "Evolution gateway error"}. Please check your connection in Control Room.`,
            };
          }
        } catch (err: any) {
          await dbUpdateUserActionStatus(pendingAction.id, "failed");
          return {
            handled: true,
            reply: `⚠️ *Delivery Error:* ${err.message}`,
          };
        }
      }

      // Execute Text Message Dispatch
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
  // 2. Contact List Visibility, Overview & Count Queries
  // ("can you access my contact list", "how many contacts do i have", "show my contacts", "list contacts")
  // -------------------------------------------------------------
  const isContactAccessOrCount =
    /\b(can you access|can you see|can you view|access|see through|look through|do you have access to|show|view|check|list|count|how many)\b.*\b(contact|contacts|contact list|address book|phone book)\b/i.test(
      lower
    ) ||
    /^(contacts|contact list|all contacts|my contacts|my contact list)$/i.test(lower);

  if (isContactAccessOrCount) {
    const overview = await dbGetContactsOverview({ workspaceId, instanceName });
    const sampleList = overview.sampleContacts
      .slice(0, 8)
      .map((c, i) => `   ${i + 1}. *${c.name}* (${c.formattedPhone})`)
      .join("\n");

    return {
      handled: true,
      reply:
        `📱 *Yes ${ownerName}, I have full live access to your WhatsApp address book!*\n\n` +
        `📊 *Your Contact Book Overview:*\n` +
        `• *Total WhatsApp Contacts:* ${overview.totalContacts} saved contacts (Instance: *${instanceName}*)\n` +
        `• *CRM Leads:* ${overview.totalLeads} active leads\n\n` +
        `👥 *Recent Contacts in your address book:*\n` +
        `${sampleList || "   (No named contacts found)"}\n\n` +
        `💡 *What you can tell me to do:*\n` +
        `• *Search any contact:* \`search contact Seyi\` or \`find contact Ola\`\n` +
        `• *Message someone:* \`message [Name]: [Your message]\`\n` +
        `• *Buckets:* \`list buckets\` to broadcast to customer groups`,
    };
  }

  // -------------------------------------------------------------
  // 2.5 Contact Search Commands ("search contact Seyi", "find contact Ola", "who is Seyi in my contacts")
  // -------------------------------------------------------------
  const isExplicitContactSearch =
    /\b(contact|contacts|phonebook|address\s+book|phone\s+number|number\s+for)\b/i.test(lower) ||
    /^(?:search|find|lookup|look\s+up)\s+(?:contact\s+|number\s+for\s+)/i.test(lower);

  const contactSearchMatch = isExplicitContactSearch
    ? lower.match(
        /^(?:search|find|look\s+(?:up|for)|check|who\s+is)\s+(?:contact\s+|number\s+for\s+|for\s+)?([a-zA-Z0-9_\-\s]+?)(?:\s+in\s+(?:my\s+)?(?:contacts?|phonebook|address\s+book))?$/i
      )
    : null;

  if (contactSearchMatch) {
    let rawQuery = contactSearchMatch[1].trim();
    // Ignore generic pronouns or questions
    if (!/^(status|broadcast|bucket|me|you|someone|person|people|number|lead|leads|group|founder|president|ceo|the|who|what|why|how)$/i.test(rawQuery)) {
      const matches = await dbFindContactsByNameOrPhone({
        workspaceId,
        query: rawQuery,
        instanceName,
      });

      if (matches.length === 0) {
        // Only return handled if the query was unquestionably an explicit contact command
        if (/\b(contact|contacts|phonebook|address\s+book)\b/i.test(lower)) {
          return {
            handled: true,
            reply: `🔍 ${ownerName}, I found no contacts matching "*${rawQuery}*" in your saved WhatsApp contacts or CRM.\n\n💡 You can try searching by first name, last name, or digits from their phone number.`,
          };
        }
        // Otherwise, allow it to fall through to the AI brain
        return { handled: false, reply: "" };
      }

      const formatted = matches
        .slice(0, 8)
        .map((m, i) => `   ${i + 1}. *${m.name}* (${m.formattedPhone})`)
        .join("\n");

      return {
        handled: true,
        reply:
          `🔍 *Found ${matches.length} contact(s) matching "${rawQuery}":*\n\n` +
          `${formatted}\n\n` +
          `💡 To deliver a message, just tell me:\n\`message ${matches[0].name}: [your message]\``,
      };
    }
  }

  // -------------------------------------------------------------
  // 3. Bucket Listing Commands ("list buckets", "my buckets", "bucket list")
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
  // 3.5 Bucket Delivery Commands ("deliver this message to bucket 1", "send to bucket 1: ...")
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
  // 4. Hypothetical / Rhetorical Messaging Inquiries
  // ("So, if I say you should message Ola, you won't?", "Can you message Ola?", "Will you message someone?")
  // -------------------------------------------------------------
  const isHypotheticalMessaging =
    /\b(if i (?:say|tell|ask)|what if|can you (?:please )?(?:message|text)|will you (?:message|text)|would you (?:message|text)|could you (?:message|text))\b/i.test(
      lower
    ) || (lower.endsWith("?") && !userText.includes(":"));

  if (isHypotheticalMessaging && /\b(message|text)\b/i.test(lower)) {
    // Extract candidate target name if present
    const nameMatch = lower.match(/\b(?:message|text)\s+([a-zA-Z0-9_\-]+)/i);
    const candidateName = nameMatch ? nameMatch[1].replace(/[?,.!]/g, "").trim() : "";

    let searchSnippet = "";
    if (candidateName && !/^(someone|anyone|them|him|her|me|you|people|person|now|later)$/i.test(candidateName)) {
      const matches = await dbFindContactsByNameOrPhone({
        workspaceId,
        query: candidateName,
        instanceName,
      });

      if (matches.length > 0) {
        const topMatches = matches
          .slice(0, 5)
          .map((m, i) => `   ${i + 1}. *${m.name}* (${m.formattedPhone})`)
          .join("\n");
        searchSnippet = `\n\nFor example, I just searched your address book for "*${candidateName}*" and found:\n${topMatches}\n`;
      }
    }

    return {
      handled: true,
      reply:
        `Of course I will, ${ownerName}! 🚀 I have full, direct access to your saved WhatsApp contacts and CRM leads.` +
        searchSnippet +
        `\nWhenever you want me to message someone, just command me:\n` +
        `\`message [Name]: [Your message]\`\n\n` +
        `I will look up their phone number, format the message respectfully in reported speech on your behalf, and wait for your *YES* confirmation before dispatching!`,
    };
  }

  // -------------------------------------------------------------
  // 4.5 Contact Capability Queries ("Cant he search contact through the control room again", "Can you search contact")
  // -------------------------------------------------------------
  const isContactCapabilityQuery =
    /\b(can(?:'t| not)?\s+(?:he|you)|why\s+can(?:'t| not)?\s+(?:he|you)|is\s+it\s+possible\s+to|able\s+to)\b.*\b(search\s+contact|find\s+contact|access\s+contact|look\s+up\s+contact|control\s+room|address\s+book)\b/i.test(
      lower
    ) ||
    /\b(search\s+contact\s+through\s+the\s+control\s+room|search\s+contact\s+in\s+control\s+room)\b/i.test(lower);

  if (isContactCapabilityQuery) {
    const overview = await dbGetContactsOverview({ workspaceId, instanceName });
    return {
      handled: true,
      reply:
        `Yes ${ownerName}, absolutely! 🚀 I have full, live access to search and message all contacts synced in your Control Room and WhatsApp address book (*${overview.totalContacts}* contacts saved, *${overview.totalLeads}* CRM leads).\n\n` +
        `💡 *Here is what you can do anytime:*\n` +
        `• *Search any contact:* \`search contact Ola\` or \`find contact Seyi\`\n` +
        `• *Send documents:* Attach any PDF/Word doc with caption \`send this document to [Contact Name]\`\n` +
        `• *Send message:* \`message [Contact Name]: [Your message]\`\n` +
        `• *Broadcast to groups:* \`list buckets\` or \`deliver to bucket [Name]: [Message]\``,
    };
  }

  // -------------------------------------------------------------
  // 4.8 Document & Media Forwarding to Contacts ("help me send this document to Ola Cla", "send this document to Ola", "forward this file to Seyi")
  // -------------------------------------------------------------
  const isDocumentOrMediaSend =
    /\b(?:send|forward|deliver|dispatch|give|share)\b.*\b(?:to|with)\b/i.test(userText) &&
    (/\b(?:this\s+)?(?:document|file|doc|docx|pdf|paper|attachment|media|image|photo)\b/i.test(userText) || Boolean(params.attachment?.base64));

  if (isDocumentOrMediaSend) {
    const targetMatch = userText.match(/\b(?:to|with)\s+([a-zA-Z0-9_\-\s@❤️]+?)(?:[:.,!?]|$)/i);
    let targetName = targetMatch ? targetMatch[1].trim() : "";
    targetName = targetName.replace(/\b(you won't|you wont|will you|can you|would you|could you|please|now|first|later)\b/gi, "").trim();

    const isPronounTarget = !targetName || /^(him|her|them|this\s+person|the\s+contact|that\s+person)$/i.test(targetName);
    let pronounResolvedMatch: ContactMatch | null = null;

    if (isPronounTarget && historyText) {
      const cardMatch = historyText.match(/\[Shared Contact Card:\s*([^()]+)\s*\(Phone:\s*\+?(\d+)\)\]/i);
      const contactMentionMatch = historyText.match(/contact for \*?([^*()]+?)\*?\s*\(\+?(\d+)\)/i);

      if (cardMatch) {
        const cName = cardMatch[1].trim();
        const cPhone = cardMatch[2].trim();
        pronounResolvedMatch = {
          name: cName,
          phone: cPhone,
          formattedPhone: `+${cPhone}`,
          source: "whatsapp_vcard" as any,
        };
      } else if (contactMentionMatch) {
        const cName = contactMentionMatch[1].trim();
        const cPhone = contactMentionMatch[2].trim();
        pronounResolvedMatch = {
          name: cName,
          phone: cPhone,
          formattedPhone: `+${cPhone}`,
          source: "whatsapp_vcard" as any,
        };
      }
    }

    if (pronounResolvedMatch) {
      const currentAttachment = params.attachment;
      if (currentAttachment?.base64) {
        await dbCreateUserPendingAction({
          userIdentifier: userPhone,
          actionType: "whatsapp_document" as any,
          targetRecipient: pronounResolvedMatch.phone,
          subject: currentAttachment.fileName,
          payload: JSON.stringify({
            base64: currentAttachment.base64,
            fileName: currentAttachment.fileName,
            mimetype: currentAttachment.mimetype,
            caption: `📄 Attached from ${ownerName}`,
          }),
        });

        return {
          handled: true,
          reply:
            `📋 *Ready to Send Document:* \n\n` +
            `• *File:* ${currentAttachment.fileName}\n` +
            `• *Recipient:* *${pronounResolvedMatch.name}* (${pronounResolvedMatch.formattedPhone})\n\n` +
            `👉 Reply *YES* to dispatch immediately, or *NO* to cancel.`,
        };
      } else {
        return {
          handled: true,
          reply:
            `👤 I have *${pronounResolvedMatch.name}* (${pronounResolvedMatch.formattedPhone}) ready!\n\n` +
            `Please attach the document or file here on WhatsApp, and I will dispatch it to ${pronounResolvedMatch.name} immediately.`,
        };
      }
    }

    if (
      targetName &&
      !/^(status|broadcast|everyone|all|bucket|me|you|someone|person|people|number|lead|leads|group|now|later)$/i.test(targetName)
    ) {
      const matches = await dbFindContactsByNameOrPhone({
        workspaceId,
        query: targetName,
        instanceName,
      });

      const currentAttachment = params.attachment;

      if (matches.length === 1) {
        const match = matches[0];
        if (currentAttachment?.base64) {
          await dbCreateUserPendingAction({
            userIdentifier: userPhone,
            actionType: "whatsapp_document" as any,
            targetRecipient: match.phone,
            subject: currentAttachment.fileName,
            payload: JSON.stringify({
              base64: currentAttachment.base64,
              fileName: currentAttachment.fileName,
              mimetype: currentAttachment.mimetype,
              caption: `📄 Attached from ${ownerName}`,
            }),
          });

          return {
            handled: true,
            reply:
              `📋 *Ready to Send Document:* \n\n` +
              `• *File:* ${currentAttachment.fileName}\n` +
              `• *Recipient:* *${match.name}* (${match.formattedPhone})\n\n` +
              `👉 Reply *YES* to dispatch immediately, or *NO* to cancel.`,
          };
        } else {
          return {
            handled: true,
            reply:
              `👤 I found *${match.name}* (${match.formattedPhone}) in your address book!\n\n` +
              `Please send or attach the document here on WhatsApp, and I will dispatch it to ${match.name} immediately.`,
          };
        }
      } else if (matches.length > 1) {
        const topMatches = matches
          .slice(0, 5)
          .map((m, i) => `   *${i + 1}.* *${m.name}* (${m.formattedPhone})`)
          .join("\n");

        if (currentAttachment?.base64) {
          await dbCreateUserPendingAction({
            userIdentifier: userPhone,
            actionType: "select_recipient" as any,
            targetRecipient: userPhone,
            subject: currentAttachment.fileName,
            payload: JSON.stringify({
              options: matches.slice(0, 5),
              attachment: currentAttachment,
            }),
          });

          return {
            handled: true,
            reply:
              `🔍 Found *${matches.length}* contacts matching "*${targetName}*":\n\n` +
              `${topMatches}\n\n` +
              `Which contact should I send *"${currentAttachment.fileName}"* to? Reply with *1*, *2*, or *3* (or *cancel*).`,
          };
        } else {
          return {
            handled: true,
            reply:
              `🔍 Found *${matches.length}* contacts matching "*${targetName}*":\n\n` +
              `${topMatches}\n\n` +
              `Which one would you like me to send to? Once you pick, send the document and I'll deliver it.`,
          };
        }
      } else {
        return {
          handled: true,
          reply:
            `🔍 ${ownerName}, I searched your saved WhatsApp contacts and CRM for "*${targetName}*", but found no matching contact.\n\n` +
            `💡 Please share their phone number (e.g. 080... or +234...) so I can dispatch "${currentAttachment?.fileName || "your document"}" to them!`,
        };
      }
    }
  }

  // -------------------------------------------------------------
  // 5. Contact Name Search & Actual Messaging ("help me message Femi", "message Olajide: Good morning")
  // -------------------------------------------------------------
  // Strict guard: if the user is discussing content generation, automations, workflows, integrations, creative assets, prompts, code, images, video, n8n, or asking for written text, DO NOT treat as contact outreach!
  const isDocumentOrMediaForward =
    /\b(?:send|forward|deliver)\s+(?:this\s+)?(?:document|file|doc|pdf)\s+to\b/i.test(userText);

  const isCreativeOrTechnical =
    !isDocumentOrMediaForward && (
      /\b(give\s+me|write\s+me|send\s+me|show\s+me|generate|draft|compose|prepare|create|suggest|copy|paste|copy\s+and\s+paste|intro|introduction|pitch|template|sample|marketing|sales\s+pitch|script|explanation)\b/i.test(userText) ||
      /\b(a|the|some|any|this|that|my|your|clean|short|quick|simple)\s+(?:text|message)\b/i.test(userText) ||
      /\b(automation|pipeline|workflow|n8n|bot|chatbot|webhook|integration|paystack|airtable|supabase|sheets|google\s+sheets|stripe|crm|database|api|endpoint|auto-responder|invoice|prompt|image|video|clip|script|code|json|scene|story|artifact|document|file|audio|voice\s+note|html|css|preview|link)\b/i.test(userText) ||
      /\b(i want an automation|build an automation|create an automation|automate|when someone pays|when a user|records the transaction)\b/i.test(userText) ||
      /\b(want\s+text|plain\s+text|raw\s+text|text\s+prompt|body\s+text|some\s+text|text\s+that\s+i\s+can)\b/i.test(userText)
    );

  // Command must be an intentional action to message/text someone, not a random occurrence of "text" or "message"
  const messageContactTrigger = !isCreativeOrTechnical
    ? userText.match(
        /^(?:please\s+|kindly\s+)?(?:help\s+me\s+(?:message|text)|(?:send|deliver)\s+(?:a\s+)?(?:whatsapp\s+|sms\s+)?(?:message|text)\s+to|(?:message|text)\s+)\s*([^:.]+)/i
      )
    : null;

  if (messageContactTrigger) {
    let rawTargetsStr = messageContactTrigger[1].trim();

    // Strip question marks, quotes, and punctuation
    rawTargetsStr = rawTargetsStr.replace(/[?.,!;]/g, "").trim();

    // Remove auxiliary/filler phrases like "you won't", "will you", "can you", "please"
    rawTargetsStr = rawTargetsStr.replace(/\b(you won't|you wont|will you|can you|would you|could you|please|now|first|later)\b/gi, "").trim();

    // Check if the user is asking about status, broadcast, general pronouns, prepositions, or generative words
    if (
      !rawTargetsStr ||
      /^(status|broadcast|everyone|all|bucket|me|you|him|her|them|their|his|our|its|someone|person|people|number|customer|customers|client|clients|user|users|lead|leads|whatsapp|email|sms|group|now|later|first|that|which|what|who|where|how|when|why|if|because|so|can|could|would|will|should|give|write|draft|copy|paste|intro|introduce|pitch|template|something|anything|everything)/i.test(rawTargetsStr) ||
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
          !/^(him|her|them|their|his|our|its|someone|person|people|number|customer|customers|client|clients|user|users|lead|leads|whatsapp|email|sms|invoice|won't|wont|that|which|what|who|where|how|when|why|if|can|could|copy|paste|intro|pitch)$/i.test(n)
      );

    if (names.length === 0) {
      return { handled: false, reply: "" };
    }

    const reportLines: string[] = [];
    const singleMatches: Array<{ name: string; phone: string; formattedPhone: string }> = [];
    let totalMatchesCount = 0;

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
        totalMatchesCount++;
        singleMatches.push(matches[0]);
        reportLines.push(
          `👤 *${matches[0].name}* (${matches[0].formattedPhone})`
        );
      } else {
        totalMatchesCount += matches.length;
        const formattedList = matches
          .slice(0, 5)
          .map((m, i) => `   ${i + 1}. *${m.name}* (${m.formattedPhone})`)
          .join("\n");
        reportLines.push(
          `🔍 Found *${matches.length}* contacts matching "*${nameQuery}*":\n${formattedList}`
        );
      }
    }

    // If no contacts were found at all and user did not use explicit colon syntax,
    // do NOT hijack the conversation with an error — pass through to general AI!
    if (totalMatchesCount === 0 && !explicitMessage) {
      return { handled: false, reply: "" };
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
    if (reportLines.length > 0 && totalMatchesCount > 0) {
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

import { sendWhatsAppMessage } from "./whatsapp-gateway";
import { transporter } from "./email";
import { dbUpdateUserActionStatus } from "./db";
import { placeAIVoiceCall } from "./telephony";

export interface PendingActionRecord {
  id: string;
  user_identifier: string;
  action_type: "whatsapp_message" | "email_send" | "phone_call";
  target_recipient: string;
  subject?: string | null;
  payload: string;
  status: string;
}

/**
 * Executes a verified human-approved action for a WhatsApp or Telegram user.
 */
export async function executePendingUserAction(
  action: PendingActionRecord
): Promise<{ success: boolean; message: string }> {
  try {
    // 1. WhatsApp Direct Message Dispatch
    if (action.action_type === "whatsapp_message") {
      const res = await sendWhatsAppMessage(action.payload, action.target_recipient);
      if (res.success) {
        await dbUpdateUserActionStatus(action.id, "executed");
        return {
          success: true,
          message: `✅ *Message Dispatched!*\n\nI have successfully sent your message to *+${action.target_recipient}*.`,
        };
      } else {
        await dbUpdateUserActionStatus(action.id, "failed");
        return {
          success: false,
          message: `⚠️ *Failed to dispatch WhatsApp message:* ${res.error || "Gateway error"}`,
        };
      }
    }

    // 1b. WhatsApp Contact Bucket Broadcast Dispatch
    if (action.action_type === ("broadcast_bucket" as any)) {
      const { dbGetContactBucketById } = await import("./db");
      const bucket = await dbGetContactBucketById(action.target_recipient);
      if (!bucket || !bucket.contact_phones || bucket.contact_phones.length === 0) {
        await dbUpdateUserActionStatus(action.id, "failed");
        return {
          success: false,
          message: `⚠️ *Broadcast Failed:* Bucket has no contacts or was removed.`,
        };
      }

      let sentCount = 0;
      for (const phone of bucket.contact_phones) {
        try {
          const res = await sendWhatsAppMessage(action.payload, phone);
          if (res.success) sentCount++;
        } catch {}
      }

      await dbUpdateUserActionStatus(action.id, "executed");
      return {
        success: true,
        message: `✅ *Broadcast Delivered!* 🚀\n\nSuccessfully dispatched your message to *${sentCount}* contact(s) in *${bucket.name}*.`,
      };
    }

    // 2. Email Dispatch via Gmail / SMTP
    if (action.action_type === "email_send") {
      const mailOptions = {
        from: `"Obey AI Business" <${process.env.GMAIL_USER || process.env.SMTP_USER || "obeyaibusiness@gmail.com"}>`,
        to: action.target_recipient,
        subject: action.subject || "Important Update",
        text: action.payload,
        html: `<div style="font-family: sans-serif; line-height: 1.6; color: #111;">
          <p>${action.payload.replace(/\n/g, "<br>")}</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="font-size: 11px; color: #666;">Dispatched via Obey Personal AI Agent on behalf of Femi Adeleke</p>
        </div>`,
      };

      await transporter.sendMail(mailOptions);
      await dbUpdateUserActionStatus(action.id, "executed");

      return {
        success: true,
        message: `✅ *Email Dispatched Successfully!*\n\n• *To:* ${action.target_recipient}\n• *Subject:* ${action.subject}\n• *Content:*\n"${action.payload.slice(0, 200)}..."`,
      };
    }

    // 3. AI Voice Phone Call
    if (action.action_type === "phone_call") {
      const callRes = await placeAIVoiceCall({
        toNumber: action.target_recipient,
        objective: action.payload,
        userPhone: action.user_identifier,
      });

      if (callRes.success) {
        await dbUpdateUserActionStatus(action.id, "executed");
        return {
          success: true,
          message: `📞 *AI Voice Call Initiated!*\n\n• *Target:* +${action.target_recipient}\n• *Provider:* ${callRes.providerName || "Vapi Gateway"}\n• *Call ID:* \`${callRes.callId}\`\n• *Objective:* ${action.payload}\n\n_The AI caller is dialing now. As soon as the call ends, I will send you the recording and full transcript!_`,
        };
      } else {
        await dbUpdateUserActionStatus(action.id, "failed");
        return {
          success: false,
          message: `⚠️ *Could not place AI phone call:* ${callRes.error}`,
        };
      }
    }

    return { success: false, message: "Unknown action type" };
  } catch (err: any) {
    console.error("executePendingUserAction error:", err);
    await dbUpdateUserActionStatus(action.id, "failed");
    return {
      success: false,
      message: `⚠️ *Action execution exception:* ${err.message}`,
    };
  }
}

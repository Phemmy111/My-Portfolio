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
          message: `✅ *WhatsApp Message Dispatched!*\n\n• *Recipient:* +${action.target_recipient}\n• *Message:*\n"${action.payload}"`,
        };
      } else {
        await dbUpdateUserActionStatus(action.id, "failed");
        return {
          success: false,
          message: `⚠️ *Failed to dispatch WhatsApp message:* ${res.error || "Gateway error"}`,
        };
      }
    }

    // 2. Email Dispatch via Gmail / SMTP
    if (action.action_type === "email_send") {
      const mailOptions = {
        from: `"Femi Adeleke · Obey AI" <${process.env.GMAIL_USER || "femiadeleke2020@gmail.com"}>`,
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
      });

      if (callRes.success) {
        await dbUpdateUserActionStatus(action.id, "executed");
        return {
          success: true,
          message: `📞 *AI Voice Call Initiated!*\n\n• *Target:* +${action.target_recipient}\n• *Call ID:* \`${callRes.callId}\`\n• *Objective:* ${action.payload}\n\n_The AI caller is dialing now. A transcript summary will be shared once completed._`,
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

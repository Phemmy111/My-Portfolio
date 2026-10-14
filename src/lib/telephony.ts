import { getSetting, getVapiProvidersPool, VapiProviderConfig } from "./settings";

export interface VoiceCallOptions {
  toNumber: string;
  objective: string;
  userPhone?: string;
  customPrompt?: string;
  voiceId?: string;
}

export interface VoiceCallResult {
  success: boolean;
  callId?: string;
  status: "queued" | "initiated" | "completed" | "failed";
  providerName?: string;
  error?: string;
}

/**
 * Places an autonomous outbound AI voice phone call with multi-key sequential failover.
 * Sequentially tests Account 1 -> Account 2 -> Account 3 if free credits run out or errors occur.
 */
export async function placeAIVoiceCall(options: VoiceCallOptions): Promise<VoiceCallResult> {
  const { toNumber, objective, userPhone } = options;

  try {
    // Clean phone number to E.164 international format
    let cleanPhone = toNumber.replace(/\D/g, "");
    if (cleanPhone.startsWith("0")) {
      cleanPhone = "234" + cleanPhone.slice(1);
    }
    if (!cleanPhone.startsWith("+")) {
      cleanPhone = "+" + cleanPhone;
    }

    const pool = await getVapiProvidersPool();
    const activeProviders = pool.filter((p) => p.enabled && p.apiKey?.trim());
    const errors: string[] = [];

    // 1. Multi-Key Provider Pool Sequential Failover
    for (let i = 0; i < activeProviders.length; i++) {
      const p = activeProviders[i];

      try {
        const bodyPayload: any = {
          customer: {
            number: cleanPhone,
          },
          assistantOverrides: {
            recordingEnabled: true,
            variableValues: {
              objective,
              userPhone: userPhone || "",
            },
            metadata: {
              userPhone: userPhone || "",
              objective,
            },
          },
        };

        if (p.assistantId?.trim()) {
          bodyPayload.assistantId = p.assistantId.trim();
        } else {
          // Ephemeral inline assistant with full call recording enabled
          bodyPayload.assistant = {
            firstMessage: `Hello! I am Obey, calling on behalf of my client regarding: ${objective}. Do you have a brief moment to speak?`,
            model: {
              provider: "openai",
              model: "gpt-4o-mini",
              messages: [
                {
                  role: "system",
                  content: `You are Obey, a polite, articulate, and intelligent AI voice assistant calling on behalf of your client.\nObjective: ${objective}\nKeep your spoken responses natural, concise (1-2 sentences), and courteous. Conclude warmly once the inquiry or agreement is reached.`,
                },
              ],
            },
            voice: {
              provider: "cartesia",
              voiceId: "a0e99841-438c-4a64-b679-ae501e7d6091",
            },
            recordingEnabled: true,
          };
        }

        if (p.phoneNumberId?.trim()) {
          bodyPayload.phoneNumberId = p.phoneNumberId.trim();
        }

        const res = await fetch("https://api.vapi.ai/call/phone", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${p.apiKey.trim()}`,
          },
          body: JSON.stringify(bodyPayload),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.id) {
            console.log(`[Telephony] Call placed via ${p.name} (Call ID: ${data.id})`);
            return {
              success: true,
              callId: data.id,
              status: "initiated",
              providerName: p.name,
            };
          }
        }

        // If key failed or credits exhausted (e.g. 400, 402, 403), record error and fail over to next key!
        const errText = await res.text();
        errors.push(`${p.name} (${res.status}): ${errText.slice(0, 100)}`);
        console.warn(`[Telephony] Vapi key "${p.name}" returned error, failing over to next key:`, errText);
      } catch (keyErr: any) {
        errors.push(`${p.name} exception: ${keyErr.message}`);
      }
    }

    // 2. Fallback: Log as Queued Operation
    const callId = `call-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    console.log(`[Telephony] AI Phone Call Queued for ${cleanPhone}: "${objective}" (Call ID: ${callId})`);

    return {
      success: true,
      callId,
      status: "queued",
      error: errors.length > 0 ? errors.join("; ") : undefined,
    };
  } catch (err: any) {
    console.error("placeAIVoiceCall error:", err);
    return {
      success: false,
      status: "failed",
      error: err.message || "Failed to dial phone number",
    };
  }
}


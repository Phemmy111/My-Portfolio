import { NextRequest, NextResponse } from "next/server";
import {
  dbGetWorkspaceBySlug,
  dbGetWorkspaceLeads,
  dbUpsertWorkspaceLead,
  dbMarkLeadsSaved,
  dbMarkAllUnsavedLeads,
  dbToggleLeadAutoSave,
  dbToggleWorkspaceAutoSave,
} from "@/lib/db";

interface ContactItem {
  id: string;
  phone: string;
  name: string;
  is_saved: boolean;
  auto_save: boolean;
  profile_pic_url: string | null;
  last_message?: string | null;
  source: string;
  status: string;
  created_at?: string;
  updated_at?: string;
}

function sanitizePhone(raw: string): string {
  if (!raw) return "";
  const beforeAt = raw.split("@")[0];
  return beforeAt.replace(/\D/g, "");
}

function generateVCard(contacts: ContactItem[], businessName: string): string {
  const cards = contacts.map((c) => {
    const cleanPhone = sanitizePhone(c.phone);
    const phoneWithPlus = cleanPhone.startsWith("+") ? cleanPhone : `+${cleanPhone}`;
    const rawName = (c.name || `Contact ${cleanPhone.slice(-4)}`).replace(/[\r\n;,]/g, " ").trim();
    const displayName = `${rawName} (${businessName})`;

    return [
      "BEGIN:VCARD",
      "VERSION:3.0",
      `FN:${displayName}`,
      `N:${rawName};;;;`,
      `TEL;TYPE=CELL,VOICE:${phoneWithPlus}`,
      `NOTE:Obey Auto-Saved Contact for ${businessName}. Status views enabled.`,
      "END:VCARD",
    ].join("\r\n");
  });

  return cards.join("\r\n\r\n");
}

function generateCSV(contacts: ContactItem[]): string {
  const header = "Name,Phone Number,Saved In Phone,Auto-Save Enabled,Last Message,Source";
  const rows = contacts.map((c) => {
    const name = `"${(c.name || "").replace(/"/g, '""')}"`;
    const phone = `"+${sanitizePhone(c.phone)}"`;
    const saved = c.is_saved ? "Saved (Status Views ON)" : "Unsaved (No Views Yet)";
    const auto = c.auto_save ? "Enabled" : "Disabled";
    const msg = `"${(c.last_message || "").replace(/"/g, '""')}"`;
    const src = c.source || "whatsapp";
    return `${name},${phone},${saved},${auto},${msg},${src}`;
  });
  return [header, ...rows].join("\r\n");
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { searchParams } = new URL(req.url);
    const filter = searchParams.get("filter") || "all"; // all | unsaved | saved
    const search = (searchParams.get("search") || "").toLowerCase().trim();
    const format = searchParams.get("format") || "json"; // json | vcf | csv
    const scope = searchParams.get("scope") || "all"; // all | unsaved

    const ws = await dbGetWorkspaceBySlug(slug);
    if (!ws) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    // Determine Evolution API instance name
    let instanceName = ws.whatsapp_instance_name;
    if (!instanceName || instanceName === "default") {
      instanceName = slug === "femi-adeleke" ? "obey" : `obey-${slug}`;
    }

    // 1. Fetch DB workspace leads
    const dbLeads = await dbGetWorkspaceLeads(ws.id);
    const leadsMap = new Map<string, typeof dbLeads[0]>();
    for (const lead of dbLeads) {
      const clean = sanitizePhone(lead.phone);
      if (clean) leadsMap.set(clean, lead);
    }

    // 2. Fetch live contacts from Evolution API
    const contactsMap = new Map<string, ContactItem>();
    const evoApiUrl = process.env.EVOLUTION_API_URL || "https://obey-whatsapp-api.onrender.com";
    const evoApiKey = process.env.EVOLUTION_API_KEY || "FemiObey2026!";

    try {
      const evoRes = await fetch(`${evoApiUrl}/chat/findContacts/${encodeURIComponent(instanceName)}`, {
        method: "POST",
        headers: {
          apikey: evoApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
        cache: "no-store",
      });

      if (evoRes.ok) {
        const evoList = await evoRes.json();
        if (Array.isArray(evoList)) {
          for (const item of evoList) {
            const rawJid = item.remoteJid || item.id || "";
            // Ignore group chats, broadcast lists, and invalid numbers
            if (item.isGroup || rawJid.includes("@g.us") || rawJid.includes("@broadcast") || rawJid.includes("status")) {
              continue;
            }

            const phone = sanitizePhone(rawJid);
            if (!phone || phone.length < 8) continue;

            const dbLead = leadsMap.get(phone);
            const isSaved = item.isSaved !== undefined ? Boolean(item.isSaved) : Boolean(dbLead?.is_saved);
            const pushName = item.name || item.pushName || item.verifiedName || item.notify || dbLead?.name || "";
            const finalName = pushName || `Contact ${phone.slice(-4)}`;
            const profilePicUrl = item.profilePicUrl || dbLead?.profile_pic_url || null;

            contactsMap.set(phone, {
              id: dbLead?.id || `evo_${phone}`,
              phone,
              name: finalName,
              is_saved: isSaved,
              auto_save: dbLead?.auto_save ?? true,
              profile_pic_url: profilePicUrl,
              last_message: dbLead?.last_message || null,
              source: dbLead?.source || "whatsapp",
              status: dbLead?.status || (isSaved ? "saved" : "lead"),
              created_at: dbLead?.created_at,
              updated_at: dbLead?.updated_at,
            });

            // Asynchronously record / sync into DB leads if missing or updated
            if (!dbLead) {
              dbUpsertWorkspaceLead({
                workspace_id: ws.id,
                phone,
                name: finalName,
                is_saved: isSaved,
                auto_save: true,
                profile_pic_url: profilePicUrl,
                source: "whatsapp",
                status: isSaved ? "saved" : "lead",
              }).catch(() => {});
            }
          }
        }
      }
    } catch (evoErr) {
      console.warn("[Contacts] Evolution API sync fallback:", evoErr);
    }

    // 3. Include any database leads that weren't in Evolution API list
    for (const [phone, dbLead] of leadsMap.entries()) {
      if (!contactsMap.has(phone)) {
        contactsMap.set(phone, {
          id: dbLead.id,
          phone,
          name: dbLead.name || `Contact ${phone.slice(-4)}`,
          is_saved: Boolean(dbLead.is_saved),
          auto_save: dbLead.auto_save ?? true,
          profile_pic_url: dbLead.profile_pic_url || null,
          last_message: dbLead.last_message || null,
          source: dbLead.source || "whatsapp",
          status: dbLead.status || (dbLead.is_saved ? "saved" : "lead"),
          created_at: dbLead.created_at,
          updated_at: dbLead.updated_at,
        });
      }
    }

    let allContacts = Array.from(contactsMap.values());

    // Sort: unsaved contacts first (so users can immediately review and auto-save them!), then alphabetically
    allContacts.sort((a, b) => {
      if (a.is_saved !== b.is_saved) {
        return a.is_saved ? 1 : -1; // Unsaved first
      }
      return (a.name || "").localeCompare(b.name || "");
    });

    const totalCount = allContacts.length;
    const savedCount = allContacts.filter((c) => c.is_saved).length;
    const unsavedCount = totalCount - savedCount;

    // Handle export formats (VCF or CSV)
    if (format === "vcf") {
      const exportList = scope === "unsaved" ? allContacts.filter((c) => !c.is_saved) : allContacts;
      const vcfContent = generateVCard(exportList, ws.name);
      return new NextResponse(vcfContent, {
        status: 200,
        headers: {
          "Content-Type": "text/vcard; charset=utf-8",
          "Content-Disposition": `attachment; filename="${ws.slug}-${scope}-contacts.vcf"`,
        },
      });
    }

    if (format === "csv") {
      const exportList = scope === "unsaved" ? allContacts.filter((c) => !c.is_saved) : allContacts;
      const csvContent = generateCSV(exportList);
      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${ws.slug}-${scope}-contacts.csv"`,
        },
      });
    }

    // Apply filtering for UI display
    let filtered = allContacts;
    if (filter === "unsaved") {
      filtered = filtered.filter((c) => !c.is_saved);
    } else if (filter === "saved") {
      filtered = filtered.filter((c) => c.is_saved);
    }

    if (search) {
      filtered = filtered.filter(
        (c) =>
          c.name.toLowerCase().includes(search) ||
          c.phone.toLowerCase().includes(search) ||
          (c.last_message && c.last_message.toLowerCase().includes(search))
      );
    }

    return NextResponse.json({
      success: true,
      stats: {
        total: totalCount,
        saved: savedCount,
        unsaved: unsavedCount,
        autoSaveEnabled: ws.auto_save_contacts !== false,
      },
      contacts: filtered,
    });
  } catch (error: any) {
    console.error("[Contacts API GET error]:", error);
    return NextResponse.json({ error: error.message || "Failed to load contacts" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const body = await req.json();
    const { action, phones, phone, auto_save, enabled, is_saved } = body;

    const ws = await dbGetWorkspaceBySlug(slug);
    if (!ws) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    // Determine Evolution API instance name & recipient number
    let instanceName = ws.whatsapp_instance_name;
    if (!instanceName || instanceName === "default") {
      instanceName = slug === "femi-adeleke" ? "obey" : `obey-${slug}`;
    }
    const ownerNumber = (ws as any).owner_whatsapp_number || process.env.BOSS_WHATSAPP_NUMBER || "2348120934828";
    const evoApiUrl = process.env.EVOLUTION_API_URL || "https://obey-whatsapp-api.onrender.com";
    const evoApiKey = process.env.EVOLUTION_API_KEY || "FemiObey2026!";

    // Helper to push contact cards to owner WhatsApp
    const pushContactCards = async (contactItems: Array<{ phone: string; name?: string | null }>) => {
      if (!ownerNumber || !contactItems || contactItems.length === 0) return;
      const cleanOwner = sanitizePhone(ownerNumber);
      const cards = contactItems.map((c) => {
        const clean = sanitizePhone(c.phone);
        return {
          fullName: c.name || `Contact ${clean.slice(-4)}`,
          wuid: `${clean}@s.whatsapp.net`,
          phoneNumber: clean,
        };
      });

      for (let i = 0; i < cards.length; i += 5) {
        const chunk = cards.slice(i, i + 5);
        try {
          await fetch(`${evoApiUrl}/message/sendContact/${encodeURIComponent(instanceName)}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: evoApiKey,
            },
            body: JSON.stringify({
              number: cleanOwner,
              contact: chunk,
            }),
          });
        } catch (e) {
          console.warn("[Contacts API] WhatsApp contact dispatch warning:", e);
        }
      }
    };

    // 1. Save all unsaved contacts in 1-click
    if (action === "save_all_unsaved") {
      const dbLeads = await dbGetWorkspaceLeads(ws.id);
      const unsavedLeads = dbLeads.filter((l) => !l.is_saved);
      const updated = await dbMarkAllUnsavedLeads(ws.id, true);

      // Asynchronously push all contact cards to owner WhatsApp
      pushContactCards(unsavedLeads.map((l) => ({ phone: l.phone, name: l.name }))).catch(() => {});

      return NextResponse.json({
        success: true,
        message: `Successfully marked ${updated} unsaved contacts as saved and synced to WhatsApp!`,
        updatedCount: updated,
      });
    }

    // 2. Save selected contacts (batch)
    if (action === "save_selected") {
      if (!Array.isArray(phones) || phones.length === 0) {
        return NextResponse.json({ error: "No contacts selected" }, { status: 400 });
      }
      const shouldSave = is_saved !== undefined ? Boolean(is_saved) : true;
      const updated = await dbMarkLeadsSaved(ws.id, phones, shouldSave);

      if (shouldSave) {
        const dbLeads = await dbGetWorkspaceLeads(ws.id);
        const selectedList = dbLeads.filter((l) => phones.includes(l.phone) || phones.includes(sanitizePhone(l.phone)));
        const fallbackList: Array<{ phone: string; name?: string | null }> = phones.map((p: string) => {
          const found = selectedList.find((l) => sanitizePhone(l.phone) === sanitizePhone(p));
          return { phone: p, name: found?.name };
        });
        pushContactCards(fallbackList).catch(() => {});
      }

      return NextResponse.json({
        success: true,
        message: `Updated ${updated} contacts status and synced to WhatsApp!`,
        updatedCount: updated,
      });
    }

    // 3. Toggle single contact auto-save setting
    if (action === "toggle_auto_save") {
      if (!phone) {
        return NextResponse.json({ error: "Phone number required" }, { status: 400 });
      }
      const targetAutoSave = Boolean(auto_save);
      await dbToggleLeadAutoSave(ws.id, phone, targetAutoSave);
      return NextResponse.json({
        success: true,
        phone,
        auto_save: targetAutoSave,
      });
    }

    // 4. Toggle master auto-save setting for the entire workspace
    if (action === "toggle_master_auto_save") {
      const targetEnabled = Boolean(enabled);
      await dbToggleWorkspaceAutoSave(ws.id, targetEnabled);
      return NextResponse.json({
        success: true,
        auto_save_contacts: targetEnabled,
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: any) {
    console.error("[Contacts API POST error]:", error);
    return NextResponse.json({ error: error.message || "Failed to update contacts" }, { status: 500 });
  }
}

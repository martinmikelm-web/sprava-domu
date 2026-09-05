import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function errorText(error: unknown) {
  if (error instanceof Error) return error.message;

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }

  return String(error || "Neznámá chyba");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (request.method !== "POST") {
    return json(
      { error: "Tato funkce podporuje pouze požadavek POST." },
      405
    );
  }

  let createdUserId = "";
  let stage = "start";

  try {
    stage = "configuration";

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return json(
        {
          error:
            "Na serveru chybí SUPABASE_URL nebo SUPABASE_SERVICE_ROLE_KEY.",
          stage,
        },
        500
      );
    }

    const authorization = request.headers.get("Authorization");

    if (!authorization) {
      return json(
        {
          error: "Chybí přihlášení.",
          stage: "authorization",
        },
        401
      );
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    stage = "caller";

    const token = authorization.replace(/^Bearer\s+/i, "");

    const {
      data: { user: caller },
      error: callerError,
    } = await admin.auth.getUser(token);

    if (callerError || !caller) {
      return json(
        {
          error: "Přihlášení není platné.",
          detail: callerError?.message || null,
          stage,
        },
        401
      );
    }

    stage = "manager-check";

    const { data: managerRole, error: managerError } = await admin
      .from("profile_roles")
      .select("id")
      .eq("user_id", caller.id)
      .eq("role_key", "manager")
      .maybeSingle();

    if (managerError) throw managerError;

    if (!managerRole) {
      return json(
        {
          error: "Pouze Správce může přidávat uživatele.",
          stage,
        },
        403
      );
    }

    stage = "request-body";

    const body = await request.json();

    const email = String(body?.email || "")
      .trim()
      .toLowerCase();

    const password = String(body?.password || "");
    const fullName = String(body?.full_name || "").trim();

    const username = String(body?.username || "")
      .trim()
      .toLowerCase();

    const active = body?.active !== false;

    const roles = Array.isArray(body?.roles)
      ? [...new Set(body.roles.map((value: unknown) => String(value)))]
      : [];

    const houseAssignments =
      body?.house_assignments &&
      typeof body.house_assignments === "object"
        ? body.house_assignments
        : {};

    if (!email || !email.includes("@")) {
      return json(
        {
          error: "Zadejte platný e-mail.",
          stage,
        },
        400
      );
    }

    if (password.length < 8) {
      return json(
        {
          error: "Heslo musí mít alespoň 8 znaků.",
          stage,
        },
        400
      );
    }

    if (!fullName || !username) {
      return json(
        {
          error: "Vyplňte celé jméno a uživatelské jméno.",
          stage,
        },
        400
      );
    }

    if (!roles.length) {
      return json(
        {
          error: "Uživatel musí mít alespoň jednu roli.",
          stage,
        },
        400
      );
    }

    const allowedRoles = new Set([
      "it_programmer",
      "manager",
      "owner",
      "tenant",
      "subtenant",
    ]);

    if (roles.some((role) => !allowedRoles.has(role))) {
      return json(
        {
          error: "Byla vybrána neplatná role.",
          stage,
        },
        400
      );
    }

    stage = "username-check";

    const { data: existingUsername, error: usernameError } =
      await admin
        .from("profiles")
        .select("id")
        .eq("username", username)
        .maybeSingle();

    if (usernameError) throw usernameError;

    if (existingUsername) {
      return json(
        {
          error: "Toto uživatelské jméno už někdo používá.",
          stage,
        },
        409
      );
    }

    stage = "auth-create";

    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          username,
          active,
        },
      });

    if (createError || !created.user) {
      return json(
        {
          error:
            createError?.message ||
            "Uživatele se nepodařilo vytvořit v Supabase Auth.",
          stage,
        },
        400
      );
    }

    createdUserId = created.user.id;

    /*
     * Profil obvykle automaticky vytvoří existující Supabase trigger
     * po vložení uživatele do auth.users.
     *
     * Původní verze zde používala UPSERT. Ten spustil starý ochranný
     * trigger na profiles a skončil hláškou:
     * „Nemáte oprávnění měnit tohoto uživatele.“
     *
     * Proto profil nejdříve pouze načteme. Když jej automatický trigger
     * nevytvořil, teprve potom provedeme INSERT. Neprovádíme UPDATE.
     */
    stage = "profile-check";

    const { data: existingProfile, error: profileCheckError } =
      await admin
        .from("profiles")
        .select("id")
        .eq("id", createdUserId)
        .maybeSingle();

    if (profileCheckError) throw profileCheckError;

    if (!existingProfile) {
      stage = "profile-insert";

      const { error: profileInsertError } = await admin
        .from("profiles")
        .insert({
          id: createdUserId,
          full_name: fullName,
          username,
          active,
        });

      if (profileInsertError) throw profileInsertError;
    }

    stage = "roles-insert";

    const { error: rolesError } = await admin
      .from("profile_roles")
      .insert(
        roles.map((roleKey) => ({
          user_id: createdUserId,
          role_key: roleKey,
        }))
      );

    if (rolesError) throw rolesError;

    stage = "house-roles-insert";

    const houseRows: Array<{
      user_id: string;
      house_id: string;
      role_key: string;
    }> = [];

    for (const roleKey of ["owner", "tenant", "subtenant"]) {
      if (!roles.includes(roleKey)) continue;

      const ids = Array.isArray(houseAssignments[roleKey])
        ? houseAssignments[roleKey]
        : [];

      for (const houseId of ids) {
        houseRows.push({
          user_id: createdUserId,
          house_id: String(houseId),
          role_key: roleKey,
        });
      }
    }

    if (houseRows.length) {
      const { error: houseError } = await admin
        .from("user_house_roles")
        .insert(houseRows);

      if (houseError) throw houseError;
    }

    return json({
      user_id: createdUserId,
      message: "Uživatel byl úspěšně vytvořen.",
    });
  } catch (error) {
    console.error("create-user failed", {
      stage,
      createdUserId,
      error,
    });

    /*
     * Když se vytvoří Auth účet, ale další ukládání selže,
     * účet odstraníme. V databázi tak nezůstane neúplný uživatel.
     */
    if (createdUserId) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const serviceRoleKey = Deno.env.get(
          "SUPABASE_SERVICE_ROLE_KEY"
        );

        if (supabaseUrl && serviceRoleKey) {
          const cleanupClient = createClient(
            supabaseUrl,
            serviceRoleKey,
            {
              auth: {
                autoRefreshToken: false,
                persistSession: false,
              },
            }
          );

          await cleanupClient.auth.admin.deleteUser(createdUserId);
        }
      } catch (cleanupError) {
        console.error(
          "Odstranění neúplného uživatele selhalo:",
          cleanupError
        );
      }
    }

    return json(
      {
        error: errorText(error),
        stage,
      },
      500
    );
  }
});
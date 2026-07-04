/**
 * Bröllopsfoto-worker
 *
 * Tar emot bilder från bröllopssidan och sparar dem i brudparets OneDrive
 * via Microsoft Graph. Se ../../INSTRUKTIONER-FOTON.md för installation.
 *
 * Rutter:
 *   GET  /                    – statussida
 *   GET  /auth/start?key=...  – koppla OneDrive (engångs-inloggning, kräver UPLOAD_KEY)
 *   GET  /auth/callback       – Microsofts återhopp efter inloggning
 *   POST /upload              – ta emot en bild (kräver header X-Upload-Key)
 */

const GRAPH     = 'https://graph.microsoft.com/v1.0';
const AUTH_URL  = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const SCOPE     = 'offline_access Files.ReadWrite';

const SIMPLE_UPLOAD_LIMIT = 4 * 1024 * 1024 - 1024; // Graph: enkel PUT max 4 MB
const CHUNK_SIZE = 327680 * 32;                     // 10 MiB, multipel av 320 KiB

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (request.method === 'OPTIONS') {
        return withCors(new Response(null, { status: 204 }), env);
      }
      if (url.pathname === '/auth/start')    return authStart(url, env);
      if (url.pathname === '/auth/callback') return authCallback(url, env);
      if (url.pathname === '/upload' && request.method === 'POST') {
        return withCors(await handleUpload(request, env), env);
      }
      if (url.pathname === '/') return statusPage(env);
      return new Response('Not found', { status: 404 });
    } catch (e) {
      return withCors(json({ ok: false, error: String((e && e.message) || e) }, 500), env);
    }
  }
};

// ── OAuth: koppla OneDrive-kontot ─────────────────────────────

function authStart(url, env) {
  if (url.searchParams.get('key') !== env.UPLOAD_KEY) {
    return new Response('Fel nyckel. Öppna /auth/start?key=DIN_UPLOAD_KEY', { status: 403 });
  }
  const p = new URLSearchParams({
    client_id: env.MS_CLIENT_ID,
    response_type: 'code',
    redirect_uri: url.origin + '/auth/callback',
    response_mode: 'query',
    scope: SCOPE,
    state: env.UPLOAD_KEY
  });
  return Response.redirect(AUTH_URL + '?' + p.toString(), 302);
}

async function authCallback(url, env) {
  if (url.searchParams.get('state') !== env.UPLOAD_KEY) {
    return new Response('Ogiltig state-parameter.', { status: 403 });
  }
  const code = url.searchParams.get('code');
  if (!code) {
    return htmlPage('Något gick fel',
      'Microsoft skickade ingen kod. Fel: ' +
      (url.searchParams.get('error_description') || url.searchParams.get('error') || 'okänt'));
  }
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.MS_CLIENT_ID,
      client_secret: env.MS_CLIENT_SECRET,
      code,
      redirect_uri: url.origin + '/auth/callback',
      grant_type: 'authorization_code',
      scope: SCOPE
    })
  });
  if (!res.ok) {
    return htmlPage('Något gick fel', 'Kunde inte hämta åtkomst: ' + (await res.text()));
  }
  const d = await res.json();
  await saveTokens(env, d);
  return htmlPage('Klart! ❀',
    'OneDrive är nu kopplat. Bilderna sparas i mappen “' +
    (env.FOLDER_NAME || 'Bröllopsbilder') + '”. Du kan stänga den här fliken.');
}

async function saveTokens(env, d, previousRefresh) {
  const t = {
    access_token: d.access_token,
    refresh_token: d.refresh_token || previousRefresh,
    expires_at: Date.now() + (d.expires_in - 120) * 1000
  };
  await env.TOKENS.put('ms_tokens', JSON.stringify(t));
  return t;
}

async function getAccessToken(env) {
  let t = await env.TOKENS.get('ms_tokens', 'json');
  if (!t) {
    throw new Error('OneDrive är inte kopplat ännu. Öppna /auth/start?key=DIN_UPLOAD_KEY och logga in.');
  }
  if (Date.now() < t.expires_at) return t.access_token;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.MS_CLIENT_ID,
      client_secret: env.MS_CLIENT_SECRET,
      refresh_token: t.refresh_token,
      grant_type: 'refresh_token',
      scope: SCOPE
    })
  });
  if (!res.ok) {
    throw new Error('Kunde inte förnya OneDrive-åtkomsten. Öppna /auth/start?key=... och logga in igen. (' + (await res.text()) + ')');
  }
  t = await saveTokens(env, await res.json(), t.refresh_token);
  return t.access_token;
}

// ── Uppladdning ───────────────────────────────────────────────

async function handleUpload(request, env) {
  if (request.headers.get('x-upload-key') !== env.UPLOAD_KEY) {
    return json({ ok: false, error: 'Fel uppladdningsnyckel' }, 403);
  }

  const data = await request.arrayBuffer();
  if (!data.byteLength) return json({ ok: false, error: 'Tom fil' }, 400);
  if (data.byteLength > 100 * 1024 * 1024) {
    return json({ ok: false, error: 'Filen är för stor (max 100 MB)' }, 413);
  }

  const token  = await getAccessToken(env);
  const folder = env.FOLDER_NAME || 'Bröllopsbilder';
  await ensureFolder(env, token, folder);

  const original = sanitize(decodeHeader(request.headers.get('x-file-name')) || 'foto.jpg');
  const guest    = sanitize(decodeHeader(request.headers.get('x-guest-name')) || '');
  const name     = [stockholmStamp(), guest, original].filter(Boolean).join('_');
  const itemPath = `${GRAPH}/me/drive/root:/${encodeURIComponent(folder)}/${encodeURIComponent(name)}`;
  const contentType = request.headers.get('content-type') || 'application/octet-stream';

  let result;
  if (data.byteLength <= SIMPLE_UPLOAD_LIMIT) {
    const res = await fetch(itemPath + ':/content?@microsoft.graph.conflictBehavior=rename', {
      method: 'PUT',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': contentType },
      body: data
    });
    if (!res.ok) throw new Error('OneDrive svarade ' + res.status + ': ' + (await res.text()));
    result = await res.json();
  } else {
    result = await chunkedUpload(itemPath, name, data, token);
  }

  return json({ ok: true, name: result.name, size: result.size });
}

async function chunkedUpload(itemPath, name, data, token) {
  const sessRes = await fetch(itemPath + ':/createUploadSession', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'rename', name } })
  });
  if (!sessRes.ok) {
    throw new Error('Kunde inte starta uppladdning: ' + (await sessRes.text()));
  }
  const sess  = await sessRes.json();
  const total = data.byteLength;
  let res;
  for (let start = 0; start < total; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE, total);
    res = await fetch(sess.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Range': `bytes ${start}-${end - 1}/${total}` },
      body: data.slice(start, end)
    });
    if (!res.ok && res.status !== 202) {
      throw new Error('Uppladdningen avbröts: ' + (await res.text()));
    }
  }
  return res.json();
}

async function ensureFolder(env, token, folder) {
  if (await env.TOKENS.get('folder_ok:' + folder)) return;
  const auth = { Authorization: 'Bearer ' + token };

  const check = await fetch(`${GRAPH}/me/drive/root:/${encodeURIComponent(folder)}`, { headers: auth });
  if (check.status === 404) {
    const mk = await fetch(`${GRAPH}/me/drive/root/children`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: folder, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' })
    });
    if (!mk.ok && mk.status !== 409) {
      throw new Error('Kunde inte skapa mappen: ' + (await mk.text()));
    }
  } else if (!check.ok) {
    throw new Error('Kunde inte läsa OneDrive: ' + (await check.text()));
  }
  await env.TOKENS.put('folder_ok:' + folder, '1');
}

// ── Hjälpfunktioner ───────────────────────────────────────────

async function statusPage(env) {
  const connected = !!(await env.TOKENS.get('ms_tokens'));
  return htmlPage('Bröllopsfoto',
    connected
      ? 'Tjänsten är igång och OneDrive är kopplat. ❀'
      : 'Tjänsten är igång, men OneDrive är INTE kopplat ännu. Öppna /auth/start?key=DIN_UPLOAD_KEY och logga in med Microsoft-kontot som äger OneDriven.');
}

function decodeHeader(v) {
  if (!v) return '';
  try { return decodeURIComponent(v); } catch (_) { return v; }
}

function sanitize(s) {
  return s
    .replace(/[\\/:*?"<>|#%{}~&\x00-\x1f]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80);
}

function stockholmStamp() {
  const s = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  }).format(new Date());
  return s.replace(' ', '_').replace(/:/g, '.');
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function htmlPage(title, text) {
  return new Response(
    `<!doctype html><html lang="sv"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<body style="font-family:Georgia,serif;background:#f5f0e8;color:#2d3d32;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:2rem;text-align:center">
<div><h1 style="font-weight:300;font-style:italic">${title}</h1><p style="max-width:32rem;line-height:1.6">${text}</p></div>
</body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

function withCors(res, env) {
  const h = new Headers(res.headers);
  h.set('Access-Control-Allow-Origin', env.ALLOWED_ORIGIN || '*');
  h.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Content-Type, X-Upload-Key, X-File-Name, X-Guest-Name');
  h.set('Access-Control-Max-Age', '86400');
  return new Response(res.body, { status: res.status, headers: h });
}

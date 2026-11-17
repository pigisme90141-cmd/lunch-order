import { getStore } from "@netlify/blobs";

const json = (d, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json" } });

export default async (req) => {
  const store = getStore("orders-app");
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/?/, "");
  const pwd = Netlify.env.get("ADMIN_PASSWORD");
  const isAdmin = !!pwd && req.headers.get("x-admin-password") === pwd;

  const listOrders = async () => {
    const { blobs } = await store.list({ prefix: "order:" });
    const rows = await Promise.all(blobs.map(async (b) => ({ key: b.key, ...(await store.get(b.key, { type: "json" })) })));
    return rows.sort((a, b) => a.time.localeCompare(b.time));
  };

  // 公開：讀菜單
  if (path === "menu" && req.method === "GET") {
    return json((await store.get("menu", { type: "json" })) || {});
  }

  // 公開：同仁登記（同一個名字/工號再送出 = 覆蓋）
  if (path === "order" && req.method === "POST") {
    const b = await req.json();
    const who = String(b.who || "").trim().slice(0, 30);
    const item = String(b.item || "").trim().slice(0, 100);
    const amount = Number(b.amount);
    if (!who || !item || !(amount >= 0)) return json({ error: "請填寫名字/工號、項目、金額" }, 400);
    const data = { who, item, amount, note: String(b.note || "").trim().slice(0, 200), time: new Date().toISOString() };
    await store.setJSON("order:" + encodeURIComponent(who.toLowerCase()), data);
    return json({ ok: true });
  }

  // 以下需管理密碼
  if (!isAdmin) return json({ error: "密碼錯誤" }, 401);

  if (path === "orders" && req.method === "GET") return json(await listOrders());

  if (path === "menu" && req.method === "POST") {
    const b = await req.json();
    await store.setJSON("menu", { title: b.title || "", text: b.text || "", image: b.image || "", updated: new Date().toISOString() });
    if (b.clear) for (const o of await listOrders()) await store.delete(o.key);
    return json({ ok: true });
  }

  if (path === "order" && req.method === "DELETE") {
    await store.delete(url.searchParams.get("key"));
    return json({ ok: true });
  }

  return json({ error: "not found" }, 404);
};

export const config = { path: "/api/*" };

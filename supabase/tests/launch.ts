const port = Number(Deno.env.get("PORT"));
const orig = Deno.serve.bind(Deno);
// deno-lint-ignore no-explicit-any
(Deno as any).serve = (h: any) => orig({ port, hostname: "127.0.0.1", onListen() { console.log("fn", Deno.env.get("FN"), port); } }, (req: Request) => h(req));
await import(Deno.env.get("FN_FILE")!);

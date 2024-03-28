import { CookieAgent } from "http-cookie-agent/undici";
import { CookieJar, MemoryCookieStore } from "tough-cookie";
import { fetch } from "undici";

// using memory store as basis, make 1 method async to show example
class ExampleAsyncStore extends MemoryCookieStore {
	constructor() {
		super();
		this.synchronous = false;
	}

	// @ts-ignore
	async findCookies(...args: unknown[]) {
		console.log("ExampleAsyncStore: findCookies()");
		// simulate async db call
		await new Promise<void>((res) => setTimeout(res, 100));
		// @ts-ignore
		return super.findCookies(...args);
	}
}

const main = async () => {
	// default sync-memory jar:
	const memoryJar = new CookieJar();
	await fetch("https://httpbin.org/cookies/set/session/userid", {
		dispatcher: new CookieAgent({ cookies: { jar: memoryJar } }),
	});
	let cookies = await memoryJar.getCookies(
		"https://httpbin.org/cookies/set/session/userid",
	);

	// ✅ works
	console.log("Memory jar cookies: ", cookies.length);

	const asyncStoreJar = new CookieJar(new ExampleAsyncStore());

	// ❌ will hang indefinitely here
	await fetch("https://httpbin.org/cookies/set/session/userid", {
		dispatcher: new CookieAgent({
			cookies: { jar: asyncStoreJar, async_UNSTABLE: true },
		}),
	});

	cookies = await asyncStoreJar.getCookies(
		"https://httpbin.org/cookies/set/session/userid",
	);

	// ❌ never reached
	console.log("Async store jar cookies: ", cookies.length);
};

main();

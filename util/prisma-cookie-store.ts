import type { Nullable } from "./tough-cookie-utils";

import type {
	Prisma,
	PrismaClient,
	Cookie as PrismaCookie,
} from "@prisma/client";
import { Cookie, Store, permuteDomain } from "tough-cookie";

const toToughCookie = (p: PrismaCookie) => {
	return new Cookie({
		value: p.value,
		secure: p.secure,
		httpOnly: p.httpOnly,
		sameSite: p.sameSite,
		creationIndex: p.creationIndex,
		key: p.key,

		domain: p.domain === "" ? undefined : p.domain,
		path: p.path === "" ? undefined : p.path,

		expires: p.expires === null ? "Infinity" : p.expires,
		maxAge:
			p.maxAge === null
				? undefined
				: ["Infinity", "-Infinity"].includes(p.maxAge)
				  ? (p.maxAge as "Infinity" | "-Infinity")
				  : Number.parseInt(p.maxAge),
		extensions: p.extensions?.split("\n"),
		creation: p.creation ?? undefined,
		hostOnly: p.hostOnly ?? undefined,
		pathIsDefault: p.pathIsDefault ?? undefined,
		lastAccessed: p.lastAccessed ?? undefined,
	});
};

const toPrismaCookie = (p: Cookie) => {
	return {
		value: p.value,
		secure: p.secure,
		httpOnly: p.httpOnly,
		sameSite: p.sameSite ?? "none",
		creationIndex: p.creationIndex,
		key: p.key,

		domain: p.domain === null ? "" : p.domain,
		path: p.path === null ? "" : p.path,
		expires: p.expires === "Infinity" ? null : p.expires,
		maxAge: p.maxAge?.toString() ?? null,
		extensions: p.extensions?.join("\n") ?? null,
		creation: p.creation,
		hostOnly: p.hostOnly,
		pathIsDefault: p.pathIsDefault,
		lastAccessed: p.lastAccessed,
	} satisfies Omit<PrismaCookie, "id" | "userId">;
};

export class PrismaCookieStore extends Store {
	constructor(
		private db: PrismaClient,
		private userSpecifier: Prisma.CustomerWhereUniqueInput,
	) {
		super();
		this.synchronous = false;
	}

	private async findFirstCookies(ops: {
		domain: string;
		path: string;
		key: string;
	}) {
		const { domain, path, key } = ops;
		console.log("findFirstCookies", { domain, path, key });

		const result = await this.db.cookie.findFirst({
			where: {
				domain,
				path,
				key,
				user: this.userSpecifier,
			},
		});

		return result && toToughCookie(result);
	}

	private async findManyCookies(ops?: {
		domains?: string[] | undefined;
		path?: string | undefined;
	}) {
		const { domains, path } = ops ?? {};
		console.log("findManyCookies", { domains, path });

		// await new Promise<void>((res) => setTimeout(res, 100));

		return [] as Cookie[];

		// const allCookies = await this.db.cookie
		// 	.findMany({
		// 		where: {
		// 			// domain: {
		// 			// 	in: domains,
		// 			// },
		// 			// path,
		// 			// user: this.userSpecifier,
		// 		},
		// 		// orderBy: {
		// 		// 	creationIndex: "asc",
		// 		// },
		// 	})
		// 	.catch((e) => {
		// 		console.error(e);
		// 		return [];
		// 	});

		// console.log(allCookies.length);

		// // no path specified, return all
		// if (!path) {
		// 	return allCookies.map(toToughCookie);
		// }

		// return allCookies
		// 	.filter((c) => {
		// 		return pathMatch(path, c.path) && Boolean(c.value);
		// 	})
		// 	.map(toToughCookie);
	}

	private async createCookie(ops: {
		cookie: Cookie;
	}) {
		const data = toPrismaCookie(ops.cookie);
		console.log("createCookie", {
			key: ops.cookie.key,
			value: ops.cookie.value,
		});

		const user = await this.db.customer.findUniqueOrThrow({
			where: this.userSpecifier,
			select: { id: true },
		});

		await this.db.cookie.upsert({
			create: {
				...data,
				userId: user.id,
			},
			update: data,
			where: {
				// domain,
				// path,
				// user: this.userSpecifier,
				userId_domain_path_key: {
					userId: user.id,
					domain: data.domain,
					path: data.path,
					key: data.key,
				},
			},
		});

		return undefined;
	}

	private async deleteCookies(ops: {
		domain: string;
		path: string;
		key?: string | undefined;
	}) {
		const { domain, path, key } = ops;

		if (!domain || !path) {
			return undefined;
		}

		const result = await this.db.cookie.deleteMany({
			where: {
				domain,
				path,
				key,
				user: this.userSpecifier,
			},
		});

		return undefined;
	}

	private async deleteAllCookies() {
		const result = await this.db.cookie.deleteMany({
			where: {
				user: this.userSpecifier,
			},
		});

		return undefined;
	}

	// store methods

	async findCookie(
		domain: Nullable<string>,
		path: Nullable<string>,
		key: Nullable<string>,
		cb: (err: Error | null, cookie: Cookie | null) => void,
	) {
		if (domain == null || path == null || key == null) {
			return cb(null, null);
		}

		try {
			const cookie = await this.findFirstCookies({ domain, path, key });
			cb(null, cookie ?? null);
		} catch (e) {
			cb(new Error("Unknown error"), null);
		}
	}

	async findCookies(
		domain: string,
		path: string,
		allowSpecialUseDomain: boolean,
		cb: (err: Error | null, cookie: Cookie[]) => void,
	) {
		// if (typeof allowSpecialUseDomain === "function") {
		// 	// biome-ignore lint/style/noParameterAssign: copied from example
		// 	callback = allowSpecialUseDomain;
		// 	// TODO: It's weird that `allowSpecialUseDomain` defaults to false with no callback,
		// 	// but true with a callback. This is legacy behavior from v4.
		// 	// biome-ignore lint/style/noParameterAssign: copied from example
		// 	allowSpecialUseDomain = true;
		// }

		if (!domain) {
			return cb(null, []);
		}

		console.log({ domain, path });

		try {
			const domains = permuteDomain(domain, allowSpecialUseDomain) || [domain];
			const cookies = await this.findManyCookies({ domains, path });
			return cb(null, cookies);
		} catch (e) {
			return cb(new Error("Unknown error"), []);
		}
	}

	async putCookie(cookie: Cookie, cb: (err: Error | null) => void) {
		try {
			await this.createCookie({ cookie });
			cb(null);
		} catch (e) {
			cb(new Error("Unknown error"));
		}
	}

	async updateCookie(
		oldCookie: Cookie,
		newCookie: Cookie,
		cb: (err: Error | null) => void,
	) {
		// updateCookie() may avoid updating cookies that are identical.  For example,
		// lastAccessed may not be important to some stores and an equality
		// comparison could exclude that field.
		return this.putCookie(newCookie, cb);
	}

	async removeCookie(
		domain: string,
		path: string,
		key: string,
		cb: (err: Error | null) => void,
	) {
		try {
			await this.deleteCookies({ domain, path, key });
			cb(null);
		} catch (e) {
			cb(new Error("Unknown error"));
		}
	}

	async removeCookies(
		domain: string,
		path: string,
		cb: (err: Error | null) => void,
	) {
		try {
			await this.deleteCookies({ domain, path });
			cb(null);
		} catch (e) {
			cb(new Error("Unknown error"));
		}
	}

	// override removed - not in parent class
	async removeAllCookies(cb: (err: Error | null) => void) {
		try {
			await this.deleteAllCookies();
			cb(null);
		} catch (e) {
			cb(new Error("Unknown error"));
		}
	}

	async getAllCookies(cb: (err: Error | null, cookie: Cookie[]) => void) {
		try {
			const cookies = await this.findManyCookies();
			return cb(null, cookies);
		} catch (e) {
			return cb(new Error("Unknown error"), []);
		}
	}
}

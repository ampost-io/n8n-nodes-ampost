import { createHmac, timingSafeEqual } from 'crypto';

/** How far a webhook's `Ampost-Timestamp` may be from now, as Ampost's docs ask receivers to check. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

/**
 * Checks `Ampost-Signature: sha256=<hex>`: the HMAC-SHA256 of
 * `<Ampost-Timestamp>.<raw body>` keyed with the webhook's secret. An old
 * timestamp fails too, so a captured request cannot be replayed later.
 */
export function verifyAmpostSignature(input: {
	secret: string;
	rawBody: string | Buffer;
	timestamp: string | undefined;
	signature: string | undefined;
	nowSeconds?: number;
}): boolean {
	const { secret, signature } = input;
	if (!secret || !signature || !input.timestamp || !/^\d+$/.test(input.timestamp)) return false;
	const timestamp = Number(input.timestamp);

	const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
	if (Math.abs(now - timestamp) > SIGNATURE_TOLERANCE_SECONDS) return false;

	const body =
		typeof input.rawBody === 'string' ? Buffer.from(input.rawBody, 'utf8') : input.rawBody;
	const hmac = createHmac('sha256', secret);
	hmac.update(`${timestamp}.`);
	hmac.update(body);
	const expected = Buffer.from(`sha256=${hmac.digest('hex')}`);
	const received = Buffer.from(signature);
	return expected.length === received.length && timingSafeEqual(expected, received);
}

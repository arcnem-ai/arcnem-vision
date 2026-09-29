import { Resend } from "resend";

// AUTH_EMAIL_DELIVERY decides how sign-in codes reach people:
// - "resend" emails them (RESEND_API_KEY and TRANSACTIONAL_EMAIL_ADDRESS).
// - "log" writes them to the API log. Anyone who can read the logs can sign in
//   as anyone, so use it only for local development or a single-operator
//   deployment where the operator is the only person with log access.
type AuthEmailDelivery =
	| { kind: "resend"; client: Resend; from: string }
	| { kind: "log" };

let delivery: AuthEmailDelivery | null = null;

export function requireAuthEmailDelivery(): AuthEmailDelivery {
	if (delivery) return delivery;
	const kind = process.env.AUTH_EMAIL_DELIVERY?.trim();
	if (kind === "log") {
		delivery = { kind: "log" };
		return delivery;
	}
	if (kind !== "resend") {
		throw new Error('AUTH_EMAIL_DELIVERY must be set to "resend" or "log"');
	}
	const apiKey = process.env.RESEND_API_KEY?.trim();
	const from = process.env.TRANSACTIONAL_EMAIL_ADDRESS?.trim();
	if (!apiKey || !from) {
		throw new Error(
			'AUTH_EMAIL_DELIVERY="resend" requires RESEND_API_KEY and TRANSACTIONAL_EMAIL_ADDRESS',
		);
	}
	delivery = { kind: "resend", client: new Resend(apiKey), from };
	return delivery;
}

function buildOTPEmailHTML(otp: string) {
	return `
		<div style="background:#fff9ef;padding:32px 16px;font-family:Manrope,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#172033;">
			<div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid rgba(15,23,42,0.08);border-radius:24px;overflow:hidden;box-shadow:0 20px 45px rgba(14,165,233,0.12);">
				<div style="padding:28px 28px 20px;background:linear-gradient(135deg,rgba(249,168,37,0.18),rgba(14,165,233,0.14));">
					<p style="margin:0 0 10px;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#475569;">Arcnem Vision</p>
					<h1 style="margin:0;font-size:28px;line-height:1.15;font-family:'Bricolage Grotesque',Manrope,sans-serif;">Your sign-in code</h1>
				</div>
				<div style="padding:28px;">
					<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#334155;">
						Use this one-time code to finish signing in to the dashboard.
					</p>
					<div style="margin:0 0 18px;padding:18px 20px;border-radius:18px;background:#f8fafc;border:1px solid rgba(15,23,42,0.08);text-align:center;">
						<span style="display:block;font-size:34px;letter-spacing:0.28em;font-weight:700;color:#0f172a;">${otp}</span>
					</div>
					<p style="margin:0;font-size:14px;line-height:1.6;color:#64748b;">
						This code expires in 5 minutes. If you did not request it, you can ignore this email.
					</p>
				</div>
			</div>
		</div>
	`;
}

export async function sendAuthOTPEmail({
	email,
	otp,
	type,
}: {
	email: string;
	otp: string;
	type: "sign-in" | "email-verification" | "forget-password" | "change-email";
}) {
	const delivery = requireAuthEmailDelivery();
	if (delivery.kind === "log") {
		console.info(`[auth] ${type} OTP for ${email}: ${otp}`);
		return;
	}

	const subject =
		type === "sign-in"
			? "Your Arcnem Vision sign-in code"
			: "Your Arcnem Vision verification code";

	const response = await delivery.client.emails.send({
		from: delivery.from,
		to: email,
		subject,
		html: buildOTPEmailHTML(otp),
	});

	if ("error" in response && response.error) {
		throw new Error(response.error.message ?? "Failed to send OTP email.");
	}
}

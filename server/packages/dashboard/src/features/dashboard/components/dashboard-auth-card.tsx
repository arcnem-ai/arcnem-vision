import { Mail, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { authAPIBaseURL, authClient, signIn } from "@/lib/auth-client";

function errorMessage(error: unknown, fallback: string) {
	if (
		error &&
		typeof error === "object" &&
		"message" in error &&
		typeof error.message === "string" &&
		error.message.trim().length > 0
	) {
		return error.message;
	}

	return fallback;
}

export function DashboardAuthCard({
	signUpEnabled,
	organizationCreationEnabled,
	debugSessionBootstrapEnabled,
}: {
	signUpEnabled: boolean;
	organizationCreationEnabled: boolean;
	debugSessionBootstrapEnabled: boolean;
}) {
	const [email, setEmail] = useState("");
	const [otp, setOtp] = useState("");
	const [step, setStep] = useState<"email" | "otp">("email");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isBootstrappingDebugSession, setIsBootstrappingDebugSession] =
		useState(false);
	const [error, setError] = useState<string | null>(null);
	const [message, setMessage] = useState<string | null>(null);

	const normalizedEmail = email.trim().toLowerCase();

	useEffect(() => {
		if (!debugSessionBootstrapEnabled) {
			return;
		}

		let cancelled = false;
		setIsBootstrappingDebugSession(true);
		setError(null);
		setMessage("Loading local debug session…");

		void fetch(`${authAPIBaseURL}/api/auth/debug/session`, {
			credentials: "include",
		})
			.then(async (response) => {
				if (!response.ok) {
					throw new Error("Debug session bootstrap is unavailable.");
				}

				if (cancelled || typeof window === "undefined") {
					return;
				}

				window.location.replace(window.location.href);
			})
			.catch(() => {
				if (cancelled) {
					return;
				}

				setIsBootstrappingDebugSession(false);
				setMessage(null);
			});

		return () => {
			cancelled = true;
		};
	}, [debugSessionBootstrapEnabled]);

	const handleSendCode = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!normalizedEmail) {
			setError("Email is required.");
			return;
		}

		setIsSubmitting(true);
		setError(null);
		setMessage(null);

		try {
			const { error: sendError } =
				await authClient.emailOtp.sendVerificationOtp({
					email: normalizedEmail,
					type: "sign-in",
				});

			if (sendError) {
				throw sendError;
			}

			setStep("otp");
			setMessage(`A sign-in code was sent to ${normalizedEmail}.`);
		} catch (caughtError) {
			setError(
				errorMessage(
					caughtError,
					"Could not send a sign-in code. Check the email setup and try again.",
				),
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleVerifyCode = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!normalizedEmail) {
			setError("Email is required.");
			setStep("email");
			return;
		}
		if (!otp.trim()) {
			setError("Enter the 6-digit code from your email.");
			return;
		}

		setIsSubmitting(true);
		setError(null);
		setMessage(null);

		try {
			const { error: signInError } = await signIn.emailOtp({
				email: normalizedEmail,
				otp: otp.trim(),
			});

			if (signInError) {
				throw signInError;
			}

			setMessage("Signed in. Loading your dashboard…");
			if (typeof window !== "undefined") {
				window.location.replace("/");
			}
		} catch (caughtError) {
			setError(
				errorMessage(caughtError, "That code did not work. Request a new one."),
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<Card className="border-slate-200/70 bg-white/88 shadow-[0_18px_45px_rgba(15,23,42,0.08)] backdrop-blur-sm">
			<CardHeader className="gap-4">
				<div className="flex size-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
					<ShieldCheck className="size-6" />
				</div>
				<div className="space-y-2">
					<CardTitle className="font-display text-2xl">
						Sign in with email OTP
					</CardTitle>
					<CardDescription className="max-w-2xl text-sm leading-6 text-slate-600">
						{signUpEnabled
							? "Enter your email and we'll send a one-time code. New users can sign in too."
							: "Enter the email for an existing account and we'll send a one-time code."}{" "}
						{organizationCreationEnabled
							? "If your account has no organization yet, the dashboard will guide you through creating one before loading the workspace."
							: "If your account has no organization yet, you will need someone to add you to one before you can use the workspace."}
					</CardDescription>
				</div>
			</CardHeader>
			<CardContent className="space-y-4">
				{message ? (
					<div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
						{message}
					</div>
				) : null}
				{error ? (
					<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
						{error}
					</div>
				) : null}

				{step === "email" ? (
					<form className="space-y-4" onSubmit={handleSendCode}>
						<div className="space-y-2">
							<label
								htmlFor="dashboard-email"
								className="text-sm font-medium text-slate-700"
							>
								Email
							</label>
							<div className="relative">
								<Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
								<Input
									id="dashboard-email"
									type="email"
									value={email}
									onChange={(event) => setEmail(event.target.value)}
									placeholder="you@example.com"
									className="h-11 rounded-xl border-slate-200 pl-10"
									autoComplete="email"
									disabled={isSubmitting || isBootstrappingDebugSession}
									required
								/>
							</div>
						</div>
						<Button
							type="submit"
							disabled={isSubmitting || isBootstrappingDebugSession}
							className="h-11 rounded-xl px-5"
						>
							{isBootstrappingDebugSession
								? "Loading debug session…"
								: isSubmitting
									? "Sending code…"
									: "Send sign-in code"}
						</Button>
					</form>
				) : (
					<form className="space-y-4" onSubmit={handleVerifyCode}>
						<div className="space-y-2">
							<label
								htmlFor="dashboard-otp"
								className="text-sm font-medium text-slate-700"
							>
								One-time code
							</label>
							<Input
								id="dashboard-otp"
								value={otp}
								onChange={(event) =>
									setOtp(event.target.value.replace(/\s+/g, "").slice(0, 6))
								}
								inputMode="numeric"
								autoComplete="one-time-code"
								placeholder="123456"
								className="h-11 rounded-xl border-slate-200 text-center text-lg tracking-[0.35em]"
								disabled={isSubmitting || isBootstrappingDebugSession}
								required
							/>
							<p className="text-xs text-slate-500">
								Code sent to{" "}
								<span className="font-medium">{normalizedEmail}</span>.
							</p>
						</div>
						<div className="flex flex-wrap gap-3">
							<Button
								type="submit"
								disabled={isSubmitting || isBootstrappingDebugSession}
								className="h-11 rounded-xl px-5"
							>
								{isSubmitting ? "Signing in…" : "Verify and continue"}
							</Button>
							<Button
								type="button"
								variant="outline"
								className="h-11 rounded-xl px-5"
								disabled={isSubmitting || isBootstrappingDebugSession}
								onClick={() => {
									setOtp("");
									setError(null);
									setMessage(null);
									setStep("email");
								}}
							>
								Change email
							</Button>
						</div>
					</form>
				)}
			</CardContent>
		</Card>
	);
}

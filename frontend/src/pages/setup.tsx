{/* Initial setup page */}
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import { APP_NAME } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { getApiErrorMessage } from "@/lib/api";
import { Server, Loader2, AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";

const setupSchema = z
	.object({
		name: z.string().min(1, "Name is required"),
		email: z.string().email("Invalid email"),
		password: z
			.string()
			.min(8, "Password must be at least 8 characters")
			.regex(
				/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
				"Password must contain at least one uppercase letter, one lowercase letter, and one number",
			),
		confirmPassword: z.string().min(1, "Confirm password"),
	})
	.refine((data) => data.password === data.confirmPassword, {
		message: "Passwords do not match",
		path: ["confirmPassword"],
	});

type SetupForm = z.infer<typeof setupSchema>;

export function SetupPage() {
	const navigate = useNavigate();
	const setAuth = useAuthStore((s) => s.setAuth);
	const [error, setError] = useState<string | null>(null);

	const {
		register,
		handleSubmit,
		formState: { errors },
	} = useForm<SetupForm>({
		resolver: zodResolver(setupSchema),
	});

	const setupMutation = useMutation({
		mutationFn: async (data: SetupForm) => {
			const resp = await api
				.post("auth/setup", {
					json: { name: data.name, email: data.email, password: data.password },
				})
				.json<{ token: string; expiresOn: string; user: { id: number; email: string; name: string; roles: string[] } }>();

			return {
				token: resp.token,
				user: {
					id: resp.user.id,
					name: resp.user.name,
					email: resp.user.email,
					roles: resp.user.roles,
				},
			};
		},
		onSuccess: (data) => {
			setAuth(data.token, data.user);
			navigate("/", { replace: true });
		},
		onError: (err) => {
			setError(getApiErrorMessage(err));
		},
	});

	const onSubmit = (data: SetupForm) => {
		setError(null);
		setupMutation.mutate(data);
	};

	return (
		<div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/30 p-4">
			<div className="fixed inset-0 overflow-hidden pointer-events-none">
				<div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/5 rounded-full blur-3xl" />
				<div className="absolute -bottom-40 -left-40 w-80 h-80 bg-primary/5 rounded-full blur-3xl" />
			</div>

			<Card className="w-full max-w-[440px] shadow-xl border-0 bg-card/80 backdrop-blur-sm relative">
				<CardHeader className="text-center space-y-4 pb-4">
					<div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary mx-auto shadow-lg shadow-primary/20">
						<Server className="h-6 w-6 text-primary-foreground" />
					</div>
					<div>
						<CardTitle className="text-xl">Welcome to {APP_NAME}</CardTitle>
						<CardDescription className="mt-1">
							Create your admin account to get started
						</CardDescription>
					</div>
				</CardHeader>

				<CardContent>
					{error && (
						<Alert variant="destructive" className="mb-4">
							<AlertCircle className="h-4 w-4" />
							<p className="text-sm">{error}</p>
						</Alert>
					)}

					<form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="name">Full Name</Label>
							<Input
								id="name"
								placeholder="Full Name"
								autoComplete="name"
								{...register("name")}
							/>
							{errors.name && (
								<p className="text-xs text-destructive">{errors.name.message}</p>
							)}
						</div>

						<div className="space-y-2">
							<Label htmlFor="email">Email</Label>
							<Input
								id="email"
								type="email"
								placeholder="Email"
								autoComplete="email"
								{...register("email")}
							/>
							{errors.email && (
								<p className="text-xs text-destructive">{errors.email.message}</p>
							)}
						</div>

						<div className="space-y-2">
							<Label htmlFor="password">Password</Label>
							<Input
								id="password"
								type="password"
								placeholder="Password"
								autoComplete="new-password"
								{...register("password")}
							/>
							{errors.password && (
								<p className="text-xs text-destructive">{errors.password.message}</p>
							)}
							<p className="text-xs text-muted-foreground">
								Must be at least 8 characters with uppercase, lowercase, and numbers
							</p>
						</div>

						<div className="space-y-2">
							<Label htmlFor="confirmPassword">Confirm Password</Label>
							<Input
								id="confirmPassword"
								type="password"
								placeholder="Confirm Password"
								autoComplete="new-password"
								{...register("confirmPassword")}
							/>
							{errors.confirmPassword && (
								<p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
							)}
						</div>

						<Button
							type="submit"
							className="w-full"
							disabled={setupMutation.isPending}
						>
							{setupMutation.isPending ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Creating account...
								</>
							) : (
								"Create Admin Account"
							)}
						</Button>
					</form>

					<div className="mt-6 text-center">
						<p className="text-sm text-muted-foreground">
							Already configured?{" "}
							<Link
								to="/login"
								className="text-primary hover:underline font-medium"
							>
								Sign in
							</Link>
						</p>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

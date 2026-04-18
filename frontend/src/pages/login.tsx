{/* Login page */}
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { getApiErrorMessage } from "@/lib/api";
import { Server, Loader2, AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";

const loginSchema = z.object({
	email: z.string().email("Invalid email"),
	password: z.string().min(1, "Password is required"),
});

type LoginForm = z.infer<typeof loginSchema>;

export function LoginPage() {
	const navigate = useNavigate();
	const setAuth = useAuthStore((s) => s.setAuth);
	const [error, setError] = useState<string | null>(null);

	const {
		register,
		handleSubmit,
		formState: { errors },
	} = useForm<LoginForm>({
		resolver: zodResolver(loginSchema),
	});

	const loginMutation = useMutation({
		mutationFn: async (data: LoginForm) => {
			const resp = await api
				.post("auth/login", {
					json: { email: data.email, password: data.password },
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

	const onSubmit = (data: LoginForm) => {
		setError(null);
		loginMutation.mutate(data);
	};

	return (
		<div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/30 p-4">
			<div className="fixed inset-0 overflow-hidden pointer-events-none">
				<div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/5 rounded-full blur-3xl" />
				<div className="absolute -bottom-40 -left-40 w-80 h-80 bg-primary/5 rounded-full blur-3xl" />
			</div>

			<Card className="w-full max-w-[400px] shadow-xl border-0 bg-card/80 backdrop-blur-sm relative">
				<CardHeader className="text-center space-y-4 pb-4">
					<div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary mx-auto shadow-lg shadow-primary/20">
						<Server className="h-6 w-6 text-primary-foreground" />
					</div>
					<div>
						<CardTitle className="text-xl">{APP_NAME}</CardTitle>
						<CardDescription className="mt-1">
							Sign in to manage your proxy configuration
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
							<div className="flex items-center justify-between">
								<Label htmlFor="password">Password</Label>
							</div>
							<Input
								id="password"
								type="password"
								placeholder="Password"
								autoComplete="current-password"
								{...register("password")}
							/>
							{errors.password && (
								<p className="text-xs text-destructive">{errors.password.message}</p>
							)}
						</div>

						<Button
							type="submit"
							className="w-full"
							disabled={loginMutation.isPending}
						>
							{loginMutation.isPending ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Signing in...
								</>
							) : (
								"Sign In"
							)}
						</Button>
					</form>

					<div className="mt-6 text-center">
						<p className="text-sm text-muted-foreground">
							First time?{" "}
							<Link
								to="/setup"
								className="text-primary hover:underline font-medium"
							>
								Run initial setup
							</Link>
						</p>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

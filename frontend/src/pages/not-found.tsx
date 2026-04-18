{/* 404 not found page */}
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";

export function NotFoundPage() {
	const navigate = useNavigate();

	return (
		<div className="min-h-[80vh] flex items-center justify-center p-4">
			<div className="text-center space-y-6 max-w-md">
				<div className="space-y-2">
					<h1 className="text-6xl font-bold text-primary/20">404</h1>
					<h2 className="text-xl font-semibold">Page Not Found</h2>
					<p className="text-sm text-muted-foreground">
						The page you're looking for doesn't exist or has been moved.
					</p>
				</div>
				<Button onClick={() => navigate("/")} variant="outline">
					<Home className="h-4 w-4 mr-2" />
					Back to Dashboard
				</Button>
			</div>
		</div>
	);
}

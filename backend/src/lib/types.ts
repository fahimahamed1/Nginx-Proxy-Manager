// Shared type definitions for the application
export interface UserPayload {
	userId: number;
	email: string;
	roles: string[];
	isAdmin: boolean;
}

export type AppEnv = {
	Variables: { user: UserPayload };
};

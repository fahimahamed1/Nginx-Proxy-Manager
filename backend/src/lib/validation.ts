// Zod validation schemas for auth, users, and permissions
import { z } from "zod";

export const loginSchema = z.object({
        email: z.string().email(),
        password: z.string().min(1),
});

export const setupSchema = z.object({
        name: z.string().min(1).max(100),
        email: z.string().email().max(255),
        nickname: z.string().max(100).optional(),
        password: z.string().min(8).max(200),
});

export const permissionsSchema = z.object({
        visibility: z.string().optional(),
        proxyHosts: z.string().optional(),
        redirectionHosts: z.string().optional(),
        deadHosts: z.string().optional(),
        streams: z.string().optional(),
        accessLists: z.string().optional(),
        certificates: z.string().optional(),
});

export const userCreateSchema = z.object({
        email: z.string().email(),
        name: z.string().min(1),
        nickname: z.string().optional(),
        password: z.string().min(8),
        roles: z.array(z.enum(["admin", "user"])).default(["user"]),
        isDisabled: z.boolean().default(false),
        permissions: permissionsSchema.optional(),
});

export const userUpdateSchema = z.object({
        email: z.string().email().optional(),
        name: z.string().min(1).optional(),
        nickname: z.string().optional(),
        roles: z.array(z.enum(["admin", "user"])).optional(),
        isDisabled: z.boolean().optional(),
        permissions: permissionsSchema.optional(),
});

export const passwordChangeSchema = z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(8),
});

export const permissionUpdateSchema = permissionsSchema;

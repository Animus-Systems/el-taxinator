// Generated from api/openapi/openapi.json by `yarn generate:types`.
// Do not edit manually.

export interface paths {
    "/identity/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["identity-me"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/identity/me/auth-attempts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["identity-recentAuthAttempts"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/identity/me/security-events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["identity-recentSecurityEvents"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tenants": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["tenants-list"];
        put?: never;
        post: operations["tenants-create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tenants/{tenantId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["tenants-get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tenants/{tenantId}/invites": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["tenants-invites-list"];
        put?: never;
        post: operations["tenants-invites-create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tenants/{tenantId}/invites/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["tenants-invites-revoke"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tenants/{tenantId}/members": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["tenants-members-list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tenants/{tenantId}/comments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["app-accountantComments-list"];
        put?: never;
        post: operations["app-accountantComments-post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tenants/{tenantId}/comments/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["app-accountantComments-delete"];
        options?: never;
        head?: never;
        patch: operations["app-accountantComments-update"];
        trace?: never;
    };
    "/tenants/{tenantId}/accounts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["app-accounts-list"];
        put?: never;
        post: operations["app-accounts-create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tenants/{tenantId}/accounts/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["app-accounts-delete"];
        options?: never;
        head?: never;
        patch: operations["app-accounts-update"];
        trace?: never;
    };
    "/tenants/{tenantId}/receipt-aliases": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["app-aliases-list"];
        put?: never;
        post: operations["app-aliases-upsert"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tenants/{tenantId}/receipt-aliases/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["app-aliases-delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tenants/{tenantId}/business-facts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["app-businessFacts-list"];
        put?: never;
        post: operations["app-businessFacts-upsert"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tenants/{tenantId}/business-facts/{key}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["app-businessFacts-delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tenants/{tenantId}/categories": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["app-categories-list"];
        put?: never;
        post: operations["app-categories-create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tenants/{tenantId}/categories/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["app-categories-delete"];
        options?: never;
        head?: never;
        patch: operations["app-categories-update"];
        trace?: never;
    };
    "/tenants/{tenantId}/chat": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["app-chat-list"];
        put?: never;
        post: operations["app-chat-post"];
        delete: operations["app-chat-clear"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tenants/{tenantId}/chat/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["app-chat-delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tenants/{tenantId}/contacts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["app-contacts-list"];
        put?: never;
        post: operations["app-contacts-create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tenants/{tenantId}/contacts/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["app-contacts-delete"];
        options?: never;
        head?: never;
        patch: operations["app-contacts-update"];
        trace?: never;
    };
    "/tenants/{tenantId}/crypto/lots": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["app-crypto-listLots"];
        put?: never;
        post: operations["app-crypto-createLot"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tenants/{tenantId}/crypto/matches": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["app-crypto-listMatches"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tenants/{tenantId}/crypto/match": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["app-crypto-matchDisposal"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tenants/{tenantId}/files": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["app-files-list"];
        put?: never;
        post: operations["app-files-createMetadata"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tenants/{tenantId}/files/{id}/reviewed": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["app-files-setReviewed"];
        trace?: never;
    };
    "/tenants/{tenantId}/files/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["app-files-delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/fx/latest": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["app-fx-latest"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/fx/on/{rateDate}/{currency}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["app-fx-on"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tenants/{tenantId}/imports": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["app-imports-list"];
        put?: never;
        post: operations["app-imports-create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tenants/{tenantId}/imports/{id}/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["app-imports-setStatus"];
        trace?: never;
    };
    "/tenants/{tenantId}/imports/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["app-imports-delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tenants/{tenantId}/invoice-templates": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["app-invoiceTemplates-list"];
        put?: never;
        post: operations["app-invoiceTemplates-create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tenants/{tenantId}/invoice-templates/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["app-invoiceTemplates-delete"];
        options?: never;
        head?: never;
        patch: operations["app-invoiceTemplates-update"];
        trace?: never;
    };
    "/tenants/{tenantId}/invoice-templates/{id}/default": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["app-invoiceTemplates-setDefault"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tenants/{tenantId}/invoices": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["app-invoices-list"];
        put?: never;
        post: operations["app-invoices-create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tenants/{tenantId}/invoices/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["app-invoices-get"];
        put?: never;
        post?: never;
        delete: operations["app-invoices-delete"];
        options?: never;
        head?: never;
        patch: operations["app-invoices-update"];
        trace?: never;
    };
    "/tenants/{tenantId}/invoices/{invoiceId}/payments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["app-invoices-allocatePayment"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tenants/{tenantId}/invoices/{invoiceId}/payments/{paymentId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["app-invoices-removePayment"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tenants/{tenantId}/knowledge-packs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["app-knowledgePacks-list"];
        put?: never;
        post: operations["app-knowledgePacks-upsert"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tenants/{tenantId}/knowledge-packs/{id}/refresh-state": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["app-knowledgePacks-setRefreshState"];
        trace?: never;
    };
    "/tenants/{tenantId}/knowledge-packs/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["app-knowledgePacks-delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tenants/{tenantId}/income-sources": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["app-personalFinances-listIncomeSources"];
        put?: never;
        post: operations["app-personalFinances-createIncomeSource"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tenants/{tenantId}/income-sources/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["app-personalFinances-deleteIncomeSource"];
        options?: never;
        head?: never;
        patch: operations["app-personalFinances-updateIncomeSource"];
        trace?: never;
    };
    "/tenants/{tenantId}/deductions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["app-personalFinances-listDeductions"];
        put?: never;
        post: operations["app-personalFinances-createDeduction"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tenants/{tenantId}/deductions/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["app-personalFinances-deleteDeduction"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tenants/{tenantId}/products": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["app-products-list"];
        put?: never;
        post: operations["app-products-create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tenants/{tenantId}/products/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["app-products-delete"];
        options?: never;
        head?: never;
        patch: operations["app-products-update"];
        trace?: never;
    };
    "/tenants/{tenantId}/projects": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["app-projects-list"];
        put?: never;
        post: operations["app-projects-create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tenants/{tenantId}/projects/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["app-projects-delete"];
        options?: never;
        head?: never;
        patch: operations["app-projects-update"];
        trace?: never;
    };
    "/tenants/{tenantId}/purchases": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["app-purchases-list"];
        put?: never;
        post: operations["app-purchases-create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tenants/{tenantId}/purchases/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["app-purchases-get"];
        put?: never;
        post?: never;
        delete: operations["app-purchases-delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tenants/{tenantId}/purchases/{purchaseId}/payments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["app-purchases-allocatePayment"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tenants/{tenantId}/purchases/{purchaseId}/payments/{paymentId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["app-purchases-removePayment"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tenants/{tenantId}/quotes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["app-quotes-list"];
        put?: never;
        post: operations["app-quotes-create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tenants/{tenantId}/quotes/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["app-quotes-get"];
        put?: never;
        post?: never;
        delete: operations["app-quotes-delete"];
        options?: never;
        head?: never;
        patch: operations["app-quotes-update"];
        trace?: never;
    };
    "/tenants/{tenantId}/rules": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["app-rules-list"];
        put?: never;
        post: operations["app-rules-create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tenants/{tenantId}/rules/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["app-rules-delete"];
        options?: never;
        head?: never;
        patch: operations["app-rules-update"];
        trace?: never;
    };
    "/tenants/{tenantId}/rules/apply": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["app-rules-applyAll"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tenants/{tenantId}/tax-filings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["app-taxFilings-list"];
        put?: never;
        post: operations["app-taxFilings-create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tenants/{tenantId}/tax-filings/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["app-taxFilings-delete"];
        options?: never;
        head?: never;
        patch: operations["app-taxFilings-update"];
        trace?: never;
    };
    "/tenants/{tenantId}/tax-filings/{id}/file": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["app-taxFilings-markFiled"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tenants/{tenantId}/transactions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["app-transactions-list"];
        put?: never;
        post: operations["app-transactions-create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tenants/{tenantId}/transactions/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["app-transactions-delete"];
        options?: never;
        head?: never;
        patch: operations["app-transactions-update"];
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: never;
    responses: {
        /** @description Error response */
        error: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": {
                    message: string;
                    code: string;
                    issues?: {
                        message: string;
                    }[];
                };
            };
        };
    };
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    "identity-me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        email: string | null;
                        emailVerified: boolean;
                        displayName: string | null;
                        phone: string | null;
                        avatarUrl: string | null;
                        isActive: boolean;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "identity-recentAuthAttempts": {
        parameters: {
            query?: {
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        at: string;
                        ip: string | null;
                        userAgent: string | null;
                        outcome: string;
                        reason: string | null;
                    }[];
                };
            };
            default: components["responses"]["error"];
        };
    };
    "identity-recentSecurityEvents": {
        parameters: {
            query?: {
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        eventAt: string;
                        eventType: string;
                        ip: string | null;
                        userAgent: string | null;
                    }[];
                };
            };
            default: components["responses"]["error"];
        };
    };
    "tenants-list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        tenant: {
                            /** Format: uuid */
                            id: string;
                            name: string;
                            slug: string;
                            /** @enum {string} */
                            entityType: "autonomo" | "sl" | "individual";
                            createdAt: string;
                        };
                        /** @enum {string} */
                        role: "owner" | "admin" | "accountant" | "member";
                        status: string;
                    }[];
                };
            };
            default: components["responses"]["error"];
        };
    };
    "tenants-create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name: string;
                    /** @enum {string} */
                    entityType: "autonomo" | "sl";
                    slug?: string;
                };
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        name: string;
                        slug: string;
                        /** @enum {string} */
                        entityType: "autonomo" | "sl" | "individual";
                        createdAt: string;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "tenants-get": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        name: string;
                        slug: string;
                        /** @enum {string} */
                        entityType: "autonomo" | "sl" | "individual";
                        createdAt: string;
                        /** @enum {string} */
                        role: "owner" | "admin" | "accountant" | "member";
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "tenants-invites-list": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        email: string;
                        /** @enum {string} */
                        role: "owner" | "admin" | "accountant" | "member";
                        createdAt: string;
                        expiresAt: string;
                        acceptedAt: string | null;
                        revokedAt: string | null;
                    }[];
                };
            };
            default: components["responses"]["error"];
        };
    };
    "tenants-invites-create": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: email */
                    email: string;
                    /**
                     * @default member
                     * @enum {string}
                     */
                    role?: "owner" | "admin" | "accountant" | "member";
                    /** @default 14 */
                    expiresInDays?: number;
                };
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        email: string;
                        /** @enum {string} */
                        role: "owner" | "admin" | "accountant" | "member";
                        expiresAt: string;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "tenants-invites-revoke": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {boolean} */
                        ok: true;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "tenants-members-list": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        userId: string;
                        /** @enum {string} */
                        role: "owner" | "admin" | "accountant" | "member";
                        status: string;
                        email: string | null;
                        displayName: string | null;
                    }[];
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-accountantComments-list": {
        parameters: {
            query?: {
                entityType?: "transaction" | "invoice" | "purchase" | "quote" | "tax_filing" | "contact" | "file" | "knowledge_pack";
                entityId?: string;
            };
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        /** Format: uuid */
                        userId: string;
                        /** @enum {string} */
                        entityType: "transaction" | "invoice" | "purchase" | "quote" | "tax_filing" | "contact" | "file" | "knowledge_pack";
                        entityId: string;
                        body: string;
                        createdAt: string;
                        updatedAt: string;
                    }[];
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-accountantComments-post": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    entityType: "transaction" | "invoice" | "purchase" | "quote" | "tax_filing" | "contact" | "file" | "knowledge_pack";
                    entityId: string;
                    body: string;
                };
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        /** Format: uuid */
                        userId: string;
                        /** @enum {string} */
                        entityType: "transaction" | "invoice" | "purchase" | "quote" | "tax_filing" | "contact" | "file" | "knowledge_pack";
                        entityId: string;
                        body: string;
                        createdAt: string;
                        updatedAt: string;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-accountantComments-delete": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {boolean} */
                        ok: true;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-accountantComments-update": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    body: string;
                };
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        /** Format: uuid */
                        userId: string;
                        /** @enum {string} */
                        entityType: "transaction" | "invoice" | "purchase" | "quote" | "tax_filing" | "contact" | "file" | "knowledge_pack";
                        entityId: string;
                        body: string;
                        createdAt: string;
                        updatedAt: string;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-accounts-list": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        name: string;
                        bankName: string | null;
                        currencyCode: string;
                        accountNumber: string | null;
                        /** @enum {string} */
                        accountType: "bank" | "credit_card" | "crypto_exchange" | "crypto_wallet" | "cash";
                        isActive: boolean;
                        notes: string | null;
                        createdAt: string;
                        updatedAt: string;
                    }[];
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-accounts-create": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name: string;
                    bankName?: string | null;
                    /** @default EUR */
                    currencyCode?: string;
                    accountNumber?: string | null;
                    /**
                     * @default bank
                     * @enum {string}
                     */
                    accountType?: "bank" | "credit_card" | "crypto_exchange" | "crypto_wallet" | "cash";
                    notes?: string | null;
                };
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        name: string;
                        bankName: string | null;
                        currencyCode: string;
                        accountNumber: string | null;
                        /** @enum {string} */
                        accountType: "bank" | "credit_card" | "crypto_exchange" | "crypto_wallet" | "cash";
                        isActive: boolean;
                        notes: string | null;
                        createdAt: string;
                        updatedAt: string;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-accounts-delete": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {boolean} */
                        ok: true;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-accounts-update": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name?: string;
                    bankName?: string | null;
                    accountNumber?: string | null;
                    /** @enum {string} */
                    accountType?: "bank" | "credit_card" | "crypto_exchange" | "crypto_wallet" | "cash";
                    isActive?: boolean;
                    notes?: string | null;
                };
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        name: string;
                        bankName: string | null;
                        currencyCode: string;
                        accountNumber: string | null;
                        /** @enum {string} */
                        accountType: "bank" | "credit_card" | "crypto_exchange" | "crypto_wallet" | "cash";
                        isActive: boolean;
                        notes: string | null;
                        createdAt: string;
                        updatedAt: string;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-aliases-list": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        vendorText: string;
                        merchantText: string;
                        usageCount: number;
                        createdAt: string;
                        updatedAt: string;
                    }[];
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-aliases-upsert": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    vendorText: string;
                    merchantText: string;
                };
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        vendorText: string;
                        merchantText: string;
                        usageCount: number;
                        createdAt: string;
                        updatedAt: string;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-aliases-delete": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {boolean} */
                        ok: true;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-businessFacts-list": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        key: string;
                        value?: unknown;
                        source: string;
                        /** Format: uuid */
                        learnedFromSessionId: string | null;
                        createdAt: string;
                        updatedAt: string;
                    }[];
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-businessFacts-upsert": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    key: string;
                    value?: unknown;
                    /**
                     * @default manual
                     * @enum {string}
                     */
                    source?: "wizard" | "manual" | "import";
                    /** Format: uuid */
                    learnedFromSessionId?: string | null;
                };
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        key: string;
                        value?: unknown;
                        source: string;
                        /** Format: uuid */
                        learnedFromSessionId: string | null;
                        createdAt: string;
                        updatedAt: string;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-businessFacts-delete": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
                key: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {boolean} */
                        ok: true;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-categories-list": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        code: string;
                        name: string;
                        /** @enum {string} */
                        kind: "income" | "expense" | "crypto_disposal";
                        color: string;
                        llmPrompt: string | null;
                        taxFormRef: string | null;
                        isDefault: boolean;
                        createdAt: string;
                        updatedAt: string;
                    }[];
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-categories-create": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    code: string;
                    name: string;
                    /**
                     * @default expense
                     * @enum {string}
                     */
                    kind?: "income" | "expense" | "crypto_disposal";
                    /** @default #000000 */
                    color?: string;
                    llmPrompt?: string | null;
                    taxFormRef?: string | null;
                    /** @default false */
                    isDefault?: boolean;
                };
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        code: string;
                        name: string;
                        /** @enum {string} */
                        kind: "income" | "expense" | "crypto_disposal";
                        color: string;
                        llmPrompt: string | null;
                        taxFormRef: string | null;
                        isDefault: boolean;
                        createdAt: string;
                        updatedAt: string;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-categories-delete": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {boolean} */
                        ok: true;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-categories-update": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name?: string;
                    /** @enum {string} */
                    kind?: "income" | "expense" | "crypto_disposal";
                    color?: string;
                    llmPrompt?: string | null;
                    taxFormRef?: string | null;
                    isDefault?: boolean;
                };
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        code: string;
                        name: string;
                        /** @enum {string} */
                        kind: "income" | "expense" | "crypto_disposal";
                        color: string;
                        llmPrompt: string | null;
                        taxFormRef: string | null;
                        isDefault: boolean;
                        createdAt: string;
                        updatedAt: string;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-chat-list": {
        parameters: {
            query?: {
                limit?: number;
                excludeSystem?: boolean;
            };
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        /** @enum {string} */
                        role: "user" | "assistant" | "system" | "tool";
                        content: string;
                        metadata?: unknown;
                        /** @enum {string} */
                        status: "sent" | "applied" | "failed" | "draft";
                        appliedAt: string | null;
                        createdAt: string;
                    }[];
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-chat-post": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    role: "user" | "assistant" | "system" | "tool";
                    content: string;
                    metadata?: {
                        [key: string]: unknown;
                    } | null;
                    /**
                     * @default sent
                     * @enum {string}
                     */
                    status?: "sent" | "applied" | "failed" | "draft";
                };
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        /** @enum {string} */
                        role: "user" | "assistant" | "system" | "tool";
                        content: string;
                        metadata?: unknown;
                        /** @enum {string} */
                        status: "sent" | "applied" | "failed" | "draft";
                        appliedAt: string | null;
                        createdAt: string;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-chat-clear": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        deletedCount: number;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-chat-delete": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {boolean} */
                        ok: true;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-contacts-list": {
        parameters: {
            query?: {
                role?: "client" | "supplier" | "both";
            };
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        name: string;
                        email: string | null;
                        phone: string | null;
                        mobile: string | null;
                        address: string | null;
                        city: string | null;
                        postalCode: string | null;
                        province: string | null;
                        country: string | null;
                        taxId: string | null;
                        bankDetails: string | null;
                        notes: string | null;
                        /** @enum {string} */
                        role: "client" | "supplier" | "both";
                        /** @enum {string} */
                        kind: "company" | "person";
                        createdAt: string;
                        updatedAt: string;
                    }[];
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-contacts-create": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name: string;
                    /** Format: email */
                    email?: string | null;
                    phone?: string | null;
                    mobile?: string | null;
                    address?: string | null;
                    city?: string | null;
                    postalCode?: string | null;
                    province?: string | null;
                    country?: string | null;
                    taxId?: string | null;
                    bankDetails?: string | null;
                    notes?: string | null;
                    /**
                     * @default client
                     * @enum {string}
                     */
                    role?: "client" | "supplier" | "both";
                    /**
                     * @default company
                     * @enum {string}
                     */
                    kind?: "company" | "person";
                };
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        name: string;
                        email: string | null;
                        phone: string | null;
                        mobile: string | null;
                        address: string | null;
                        city: string | null;
                        postalCode: string | null;
                        province: string | null;
                        country: string | null;
                        taxId: string | null;
                        bankDetails: string | null;
                        notes: string | null;
                        /** @enum {string} */
                        role: "client" | "supplier" | "both";
                        /** @enum {string} */
                        kind: "company" | "person";
                        createdAt: string;
                        updatedAt: string;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-contacts-delete": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {boolean} */
                        ok: true;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-contacts-update": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name?: string;
                    /** Format: email */
                    email?: string | null;
                    phone?: string | null;
                    mobile?: string | null;
                    address?: string | null;
                    city?: string | null;
                    postalCode?: string | null;
                    province?: string | null;
                    country?: string | null;
                    taxId?: string | null;
                    bankDetails?: string | null;
                    notes?: string | null;
                    /** @enum {string} */
                    role?: "client" | "supplier" | "both";
                    /** @enum {string} */
                    kind?: "company" | "person";
                };
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        name: string;
                        email: string | null;
                        phone: string | null;
                        mobile: string | null;
                        address: string | null;
                        city: string | null;
                        postalCode: string | null;
                        province: string | null;
                        country: string | null;
                        taxId: string | null;
                        bankDetails: string | null;
                        notes: string | null;
                        /** @enum {string} */
                        role: "client" | "supplier" | "both";
                        /** @enum {string} */
                        kind: "company" | "person";
                        createdAt: string;
                        updatedAt: string;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-crypto-listLots": {
        parameters: {
            query?: {
                asset?: string;
                openOnly?: boolean;
            };
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        asset: string;
                        assetClass: string;
                        acquiredAt: string;
                        quantityTotal: number;
                        quantityRemaining: number;
                        costPerUnitCents: number;
                        feesCents: number;
                        /** Format: uuid */
                        sourceTransactionId: string | null;
                        createdAt: string;
                        updatedAt: string;
                    }[];
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-crypto-createLot": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    asset: string;
                    /** @default crypto */
                    assetClass?: string;
                    /** Format: date-time */
                    acquiredAt: string;
                    quantity: number;
                    costPerUnitCents: number;
                    /** @default 0 */
                    feesCents?: number;
                    /** Format: uuid */
                    sourceTransactionId?: string | null;
                };
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        asset: string;
                        assetClass: string;
                        acquiredAt: string;
                        quantityTotal: number;
                        quantityRemaining: number;
                        costPerUnitCents: number;
                        feesCents: number;
                        /** Format: uuid */
                        sourceTransactionId: string | null;
                        createdAt: string;
                        updatedAt: string;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-crypto-listMatches": {
        parameters: {
            query?: {
                year?: number;
                asset?: string;
            };
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        /** Format: uuid */
                        disposalTransactionId: string;
                        /** Format: uuid */
                        lotId: string;
                        asset: string;
                        assetClass: string;
                        quantityConsumed: number;
                        costBasisCents: number;
                        proceedsCents: number;
                        realizedGainCents: number;
                        matchedAt: string;
                    }[];
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-crypto-matchDisposal": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: uuid */
                    disposalTransactionId: string;
                    asset: string;
                    /** @default crypto */
                    assetClass?: string;
                    quantity: number;
                    proceedsCents: number;
                };
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        matches: {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            disposalTransactionId: string;
                            /** Format: uuid */
                            lotId: string;
                            asset: string;
                            assetClass: string;
                            quantityConsumed: number;
                            costBasisCents: number;
                            proceedsCents: number;
                            realizedGainCents: number;
                            matchedAt: string;
                        }[];
                        totalCostBasisCents: number;
                        totalRealizedGainCents: number;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-files-list": {
        parameters: {
            query?: {
                reviewed?: boolean;
                limit?: number;
            };
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        filename: string;
                        path: string | null;
                        cid: string | null;
                        mimetype: string;
                        sha256: string | null;
                        sizeBytes: number | null;
                        metadata?: unknown;
                        isReviewed: boolean;
                        isSplitted: boolean;
                        createdAt: string;
                        updatedAt: string;
                    }[];
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-files-createMetadata": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    filename: string;
                    mimetype: string;
                    path: string;
                    sha256?: string | null;
                    sizeBytes?: number | null;
                    metadata?: {
                        [key: string]: unknown;
                    } | null;
                };
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        filename: string;
                        path: string | null;
                        cid: string | null;
                        mimetype: string;
                        sha256: string | null;
                        sizeBytes: number | null;
                        metadata?: unknown;
                        isReviewed: boolean;
                        isSplitted: boolean;
                        createdAt: string;
                        updatedAt: string;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-files-setReviewed": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    isReviewed: boolean;
                };
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        filename: string;
                        path: string | null;
                        cid: string | null;
                        mimetype: string;
                        sha256: string | null;
                        sizeBytes: number | null;
                        metadata?: unknown;
                        isReviewed: boolean;
                        isSplitted: boolean;
                        createdAt: string;
                        updatedAt: string;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-files-delete": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {boolean} */
                        ok: true;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-fx-latest": {
        parameters: {
            query: {
                currency: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        rateDate: string;
                        currency: string;
                        eurPerUnit: number;
                        fetchedAt: string;
                    } | null;
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-fx-on": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                rateDate: string;
                currency: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        rateDate: string;
                        currency: string;
                        eurPerUnit: number;
                        fetchedAt: string;
                    } | null;
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-imports-list": {
        parameters: {
            query?: {
                status?: "pending" | "active" | "completed" | "cancelled";
            };
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        /** @enum {string} */
                        source: "csv" | "pdf" | "wizard" | "api";
                        /** @enum {string} */
                        status: "pending" | "active" | "completed" | "cancelled";
                        fileName: string | null;
                        /** Format: uuid */
                        accountId: string | null;
                        /** Format: uuid */
                        fileId: string | null;
                        columnMapping?: unknown;
                        contextFileIds: string[];
                        totalRows: number;
                        processedRows: number;
                        errorCount: number;
                        notes: string | null;
                        createdAt: string;
                        updatedAt: string;
                    }[];
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-imports-create": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /**
                     * @default csv
                     * @enum {string}
                     */
                    source?: "csv" | "pdf" | "wizard" | "api";
                    fileName?: string | null;
                    /** Format: uuid */
                    accountId?: string | null;
                    /** Format: uuid */
                    fileId?: string | null;
                    columnMapping?: {
                        [key: string]: unknown;
                    } | null;
                    /** @default [] */
                    contextFileIds?: string[];
                    notes?: string | null;
                };
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        /** @enum {string} */
                        source: "csv" | "pdf" | "wizard" | "api";
                        /** @enum {string} */
                        status: "pending" | "active" | "completed" | "cancelled";
                        fileName: string | null;
                        /** Format: uuid */
                        accountId: string | null;
                        /** Format: uuid */
                        fileId: string | null;
                        columnMapping?: unknown;
                        contextFileIds: string[];
                        totalRows: number;
                        processedRows: number;
                        errorCount: number;
                        notes: string | null;
                        createdAt: string;
                        updatedAt: string;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-imports-setStatus": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    status: "pending" | "active" | "completed" | "cancelled";
                };
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        /** @enum {string} */
                        source: "csv" | "pdf" | "wizard" | "api";
                        /** @enum {string} */
                        status: "pending" | "active" | "completed" | "cancelled";
                        fileName: string | null;
                        /** Format: uuid */
                        accountId: string | null;
                        /** Format: uuid */
                        fileId: string | null;
                        columnMapping?: unknown;
                        contextFileIds: string[];
                        totalRows: number;
                        processedRows: number;
                        errorCount: number;
                        notes: string | null;
                        createdAt: string;
                        updatedAt: string;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-imports-delete": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {boolean} */
                        ok: true;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-invoiceTemplates-list": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        name: string;
                        isDefault: boolean;
                        /** Format: uuid */
                        logoFileId: string | null;
                        /** @enum {string} */
                        logoPosition: "left" | "right" | "center";
                        accentColor: string;
                        /** @enum {string} */
                        fontPreset: "helvetica" | "times" | "courier";
                        headerText: string | null;
                        footerText: string | null;
                        bankDetailsText: string | null;
                        businessDetailsText: string | null;
                        belowTotalsText: string | null;
                        showProminentTotal: boolean;
                        showVatColumn: boolean;
                        showBankDetails: boolean;
                        paymentTermsDays: number | null;
                        /** @enum {string} */
                        language: "es" | "en";
                        labels?: unknown;
                        createdAt: string;
                        updatedAt: string;
                    }[];
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-invoiceTemplates-create": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name: string;
                    /** Format: uuid */
                    logoFileId?: string | null;
                    /**
                     * @default left
                     * @enum {string}
                     */
                    logoPosition?: "left" | "right" | "center";
                    /** @default #4f46e5 */
                    accentColor?: string;
                    /**
                     * @default helvetica
                     * @enum {string}
                     */
                    fontPreset?: "helvetica" | "times" | "courier";
                    headerText?: string | null;
                    footerText?: string | null;
                    bankDetailsText?: string | null;
                    businessDetailsText?: string | null;
                    belowTotalsText?: string | null;
                    /** @default false */
                    showProminentTotal?: boolean;
                    /** @default true */
                    showVatColumn?: boolean;
                    /** @default false */
                    showBankDetails?: boolean;
                    paymentTermsDays?: number | null;
                    /**
                     * @default es
                     * @enum {string}
                     */
                    language?: "es" | "en";
                    labels?: {
                        [key: string]: unknown;
                    } | null;
                };
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        name: string;
                        isDefault: boolean;
                        /** Format: uuid */
                        logoFileId: string | null;
                        /** @enum {string} */
                        logoPosition: "left" | "right" | "center";
                        accentColor: string;
                        /** @enum {string} */
                        fontPreset: "helvetica" | "times" | "courier";
                        headerText: string | null;
                        footerText: string | null;
                        bankDetailsText: string | null;
                        businessDetailsText: string | null;
                        belowTotalsText: string | null;
                        showProminentTotal: boolean;
                        showVatColumn: boolean;
                        showBankDetails: boolean;
                        paymentTermsDays: number | null;
                        /** @enum {string} */
                        language: "es" | "en";
                        labels?: unknown;
                        createdAt: string;
                        updatedAt: string;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-invoiceTemplates-delete": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {boolean} */
                        ok: true;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-invoiceTemplates-update": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name?: string;
                    /** Format: uuid */
                    logoFileId?: string | null;
                    /** @enum {string} */
                    logoPosition?: "left" | "right" | "center";
                    accentColor?: string;
                    /** @enum {string} */
                    fontPreset?: "helvetica" | "times" | "courier";
                    headerText?: string | null;
                    footerText?: string | null;
                    bankDetailsText?: string | null;
                    businessDetailsText?: string | null;
                    belowTotalsText?: string | null;
                    showProminentTotal?: boolean;
                    showVatColumn?: boolean;
                    showBankDetails?: boolean;
                    paymentTermsDays?: number | null;
                    /** @enum {string} */
                    language?: "es" | "en";
                    labels?: {
                        [key: string]: unknown;
                    } | null;
                };
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        name: string;
                        isDefault: boolean;
                        /** Format: uuid */
                        logoFileId: string | null;
                        /** @enum {string} */
                        logoPosition: "left" | "right" | "center";
                        accentColor: string;
                        /** @enum {string} */
                        fontPreset: "helvetica" | "times" | "courier";
                        headerText: string | null;
                        footerText: string | null;
                        bankDetailsText: string | null;
                        businessDetailsText: string | null;
                        belowTotalsText: string | null;
                        showProminentTotal: boolean;
                        showVatColumn: boolean;
                        showBankDetails: boolean;
                        paymentTermsDays: number | null;
                        /** @enum {string} */
                        language: "es" | "en";
                        labels?: unknown;
                        createdAt: string;
                        updatedAt: string;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-invoiceTemplates-setDefault": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        name: string;
                        isDefault: boolean;
                        /** Format: uuid */
                        logoFileId: string | null;
                        /** @enum {string} */
                        logoPosition: "left" | "right" | "center";
                        accentColor: string;
                        /** @enum {string} */
                        fontPreset: "helvetica" | "times" | "courier";
                        headerText: string | null;
                        footerText: string | null;
                        bankDetailsText: string | null;
                        businessDetailsText: string | null;
                        belowTotalsText: string | null;
                        showProminentTotal: boolean;
                        showVatColumn: boolean;
                        showBankDetails: boolean;
                        paymentTermsDays: number | null;
                        /** @enum {string} */
                        language: "es" | "en";
                        labels?: unknown;
                        createdAt: string;
                        updatedAt: string;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-invoices-list": {
        parameters: {
            query?: {
                status?: "draft" | "issued" | "paid" | "cancelled" | "void";
                kind?: "invoice" | "simplified";
                limit?: number;
            };
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        /** Format: uuid */
                        contactId: string | null;
                        /** Format: uuid */
                        quoteId: string | null;
                        /** Format: uuid */
                        templateId: string | null;
                        /** Format: uuid */
                        pdfFileId: string | null;
                        number: string;
                        /** @enum {string} */
                        status: "draft" | "issued" | "paid" | "cancelled" | "void";
                        /** @enum {string} */
                        kind: "invoice" | "simplified";
                        issueDate: string;
                        dueDate: string | null;
                        paidAt: string | null;
                        notes: string | null;
                        currencyCode: string;
                        totalCents: number | null;
                        irpfRate: number;
                        fxRateToEur: number | null;
                        fxRateDate: string | null;
                        fxRateSource: string | null;
                        items: {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            productId: string | null;
                            description: string;
                            quantity: number;
                            unitPriceCents: number;
                            vatRate: number;
                            position: number;
                        }[];
                        payments: {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            transactionId: string;
                            amountCents: number;
                            note: string | null;
                            source: string;
                            createdAt: string;
                        }[];
                        paidCents: number;
                        createdAt: string;
                        updatedAt: string;
                    }[];
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-invoices-create": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: uuid */
                    contactId?: string | null;
                    /** Format: uuid */
                    quoteId?: string | null;
                    /** Format: uuid */
                    templateId?: string | null;
                    number: string;
                    /**
                     * @default draft
                     * @enum {string}
                     */
                    status?: "draft" | "issued" | "paid" | "cancelled" | "void";
                    /**
                     * @default invoice
                     * @enum {string}
                     */
                    kind?: "invoice" | "simplified";
                    issueDate: string;
                    dueDate?: string | null;
                    /** @default EUR */
                    currencyCode?: string;
                    totalCents?: number | null;
                    /** @default 0 */
                    irpfRate?: number;
                    fxRateToEur?: number | null;
                    fxRateDate?: string | null;
                    fxRateSource?: string | null;
                    notes?: string | null;
                    /** @default [] */
                    items?: {
                        /** Format: uuid */
                        productId?: string | null;
                        description: string;
                        /** @default 1 */
                        quantity?: number;
                        unitPriceCents: number;
                        /** @default 21 */
                        vatRate?: number;
                        /** @default 0 */
                        position?: number;
                    }[];
                };
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        /** Format: uuid */
                        contactId: string | null;
                        /** Format: uuid */
                        quoteId: string | null;
                        /** Format: uuid */
                        templateId: string | null;
                        /** Format: uuid */
                        pdfFileId: string | null;
                        number: string;
                        /** @enum {string} */
                        status: "draft" | "issued" | "paid" | "cancelled" | "void";
                        /** @enum {string} */
                        kind: "invoice" | "simplified";
                        issueDate: string;
                        dueDate: string | null;
                        paidAt: string | null;
                        notes: string | null;
                        currencyCode: string;
                        totalCents: number | null;
                        irpfRate: number;
                        fxRateToEur: number | null;
                        fxRateDate: string | null;
                        fxRateSource: string | null;
                        items: {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            productId: string | null;
                            description: string;
                            quantity: number;
                            unitPriceCents: number;
                            vatRate: number;
                            position: number;
                        }[];
                        payments: {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            transactionId: string;
                            amountCents: number;
                            note: string | null;
                            source: string;
                            createdAt: string;
                        }[];
                        paidCents: number;
                        createdAt: string;
                        updatedAt: string;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-invoices-get": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        /** Format: uuid */
                        contactId: string | null;
                        /** Format: uuid */
                        quoteId: string | null;
                        /** Format: uuid */
                        templateId: string | null;
                        /** Format: uuid */
                        pdfFileId: string | null;
                        number: string;
                        /** @enum {string} */
                        status: "draft" | "issued" | "paid" | "cancelled" | "void";
                        /** @enum {string} */
                        kind: "invoice" | "simplified";
                        issueDate: string;
                        dueDate: string | null;
                        paidAt: string | null;
                        notes: string | null;
                        currencyCode: string;
                        totalCents: number | null;
                        irpfRate: number;
                        fxRateToEur: number | null;
                        fxRateDate: string | null;
                        fxRateSource: string | null;
                        items: {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            productId: string | null;
                            description: string;
                            quantity: number;
                            unitPriceCents: number;
                            vatRate: number;
                            position: number;
                        }[];
                        payments: {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            transactionId: string;
                            amountCents: number;
                            note: string | null;
                            source: string;
                            createdAt: string;
                        }[];
                        paidCents: number;
                        createdAt: string;
                        updatedAt: string;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-invoices-delete": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {boolean} */
                        ok: true;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-invoices-update": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    status?: "draft" | "issued" | "paid" | "cancelled" | "void";
                    issueDate?: string;
                    dueDate?: string | null;
                    /** Format: date-time */
                    paidAt?: string | null;
                    totalCents?: number | null;
                    notes?: string | null;
                    items?: {
                        /** Format: uuid */
                        productId?: string | null;
                        description: string;
                        /** @default 1 */
                        quantity?: number;
                        unitPriceCents: number;
                        /** @default 21 */
                        vatRate?: number;
                        /** @default 0 */
                        position?: number;
                    }[];
                };
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        /** Format: uuid */
                        contactId: string | null;
                        /** Format: uuid */
                        quoteId: string | null;
                        /** Format: uuid */
                        templateId: string | null;
                        /** Format: uuid */
                        pdfFileId: string | null;
                        number: string;
                        /** @enum {string} */
                        status: "draft" | "issued" | "paid" | "cancelled" | "void";
                        /** @enum {string} */
                        kind: "invoice" | "simplified";
                        issueDate: string;
                        dueDate: string | null;
                        paidAt: string | null;
                        notes: string | null;
                        currencyCode: string;
                        totalCents: number | null;
                        irpfRate: number;
                        fxRateToEur: number | null;
                        fxRateDate: string | null;
                        fxRateSource: string | null;
                        items: {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            productId: string | null;
                            description: string;
                            quantity: number;
                            unitPriceCents: number;
                            vatRate: number;
                            position: number;
                        }[];
                        payments: {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            transactionId: string;
                            amountCents: number;
                            note: string | null;
                            source: string;
                            createdAt: string;
                        }[];
                        paidCents: number;
                        createdAt: string;
                        updatedAt: string;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-invoices-allocatePayment": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
                invoiceId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: uuid */
                    transactionId: string;
                    amountCents: number;
                    note?: string | null;
                    /**
                     * @default manual
                     * @enum {string}
                     */
                    source?: "manual" | "rule" | "import";
                };
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        /** Format: uuid */
                        transactionId: string;
                        amountCents: number;
                        note: string | null;
                        source: string;
                        createdAt: string;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-invoices-removePayment": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
                invoiceId: string;
                paymentId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {boolean} */
                        ok: true;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-knowledgePacks-list": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        slug: string;
                        title: string;
                        content: string;
                        sourcePrompt: string | null;
                        lastRefreshedAt: string | null;
                        refreshIntervalDays: number;
                        provider: string | null;
                        model: string | null;
                        /** @enum {string} */
                        reviewStatus: "verified" | "pending_review" | "stale";
                        /** @enum {string} */
                        refreshState: "idle" | "in_progress" | "review_pending" | "failed";
                        refreshMessage: string | null;
                        refreshStartedAt: string | null;
                        refreshFinishedAt: string | null;
                        refreshHeartbeatAt: string | null;
                        pendingReviewContent: string | null;
                        createdAt: string;
                        updatedAt: string;
                    }[];
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-knowledgePacks-upsert": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    slug: string;
                    title: string;
                    content: string;
                    sourcePrompt?: string | null;
                    /** @default 30 */
                    refreshIntervalDays?: number;
                    provider?: string | null;
                    model?: string | null;
                    /**
                     * @default verified
                     * @enum {string}
                     */
                    reviewStatus?: "verified" | "pending_review" | "stale";
                };
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        slug: string;
                        title: string;
                        content: string;
                        sourcePrompt: string | null;
                        lastRefreshedAt: string | null;
                        refreshIntervalDays: number;
                        provider: string | null;
                        model: string | null;
                        /** @enum {string} */
                        reviewStatus: "verified" | "pending_review" | "stale";
                        /** @enum {string} */
                        refreshState: "idle" | "in_progress" | "review_pending" | "failed";
                        refreshMessage: string | null;
                        refreshStartedAt: string | null;
                        refreshFinishedAt: string | null;
                        refreshHeartbeatAt: string | null;
                        pendingReviewContent: string | null;
                        createdAt: string;
                        updatedAt: string;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-knowledgePacks-setRefreshState": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    refreshState: "idle" | "in_progress" | "review_pending" | "failed";
                    refreshMessage?: string | null;
                    pendingReviewContent?: string | null;
                    /** @default false */
                    heartbeat?: boolean;
                };
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        slug: string;
                        title: string;
                        content: string;
                        sourcePrompt: string | null;
                        lastRefreshedAt: string | null;
                        refreshIntervalDays: number;
                        provider: string | null;
                        model: string | null;
                        /** @enum {string} */
                        reviewStatus: "verified" | "pending_review" | "stale";
                        /** @enum {string} */
                        refreshState: "idle" | "in_progress" | "review_pending" | "failed";
                        refreshMessage: string | null;
                        refreshStartedAt: string | null;
                        refreshFinishedAt: string | null;
                        refreshHeartbeatAt: string | null;
                        pendingReviewContent: string | null;
                        createdAt: string;
                        updatedAt: string;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-knowledgePacks-delete": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {boolean} */
                        ok: true;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-personalFinances-listIncomeSources": {
        parameters: {
            query?: {
                kind?: "salary" | "self_employment" | "dividends" | "interest" | "rental" | "royalty" | "pension" | "other";
            };
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        /** @enum {string} */
                        kind: "salary" | "self_employment" | "dividends" | "interest" | "rental" | "royalty" | "pension" | "other";
                        name: string;
                        taxId: string | null;
                        metadata?: unknown;
                        isActive: boolean;
                        createdAt: string;
                        updatedAt: string;
                    }[];
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-personalFinances-createIncomeSource": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    kind: "salary" | "self_employment" | "dividends" | "interest" | "rental" | "royalty" | "pension" | "other";
                    name: string;
                    taxId?: string | null;
                    metadata?: {
                        [key: string]: unknown;
                    };
                };
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        /** @enum {string} */
                        kind: "salary" | "self_employment" | "dividends" | "interest" | "rental" | "royalty" | "pension" | "other";
                        name: string;
                        taxId: string | null;
                        metadata?: unknown;
                        isActive: boolean;
                        createdAt: string;
                        updatedAt: string;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-personalFinances-deleteIncomeSource": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {boolean} */
                        ok: true;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-personalFinances-updateIncomeSource": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name?: string;
                    taxId?: string | null;
                    metadata?: {
                        [key: string]: unknown;
                    } | null;
                    isActive?: boolean;
                };
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        /** @enum {string} */
                        kind: "salary" | "self_employment" | "dividends" | "interest" | "rental" | "royalty" | "pension" | "other";
                        name: string;
                        taxId: string | null;
                        metadata?: unknown;
                        isActive: boolean;
                        createdAt: string;
                        updatedAt: string;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-personalFinances-listDeductions": {
        parameters: {
            query?: {
                taxYear?: number;
            };
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        kind: string;
                        taxYear: number;
                        amountCents: number;
                        description: string | null;
                        /** Format: uuid */
                        fileId: string | null;
                        metadata?: unknown;
                        createdAt: string;
                        updatedAt: string;
                    }[];
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-personalFinances-createDeduction": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    kind: string;
                    taxYear: number;
                    amountCents: number;
                    description?: string | null;
                    /** Format: uuid */
                    fileId?: string | null;
                    metadata?: {
                        [key: string]: unknown;
                    };
                };
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        kind: string;
                        taxYear: number;
                        amountCents: number;
                        description: string | null;
                        /** Format: uuid */
                        fileId: string | null;
                        metadata?: unknown;
                        createdAt: string;
                        updatedAt: string;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-personalFinances-deleteDeduction": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {boolean} */
                        ok: true;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-products-list": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        name: string;
                        description: string | null;
                        priceCents: number;
                        currencyCode: string;
                        vatRate: number;
                        unit: string | null;
                        isArchived: boolean;
                        createdAt: string;
                        updatedAt: string;
                    }[];
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-products-create": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name: string;
                    description?: string | null;
                    /** @default 0 */
                    priceCents?: number;
                    /** @default EUR */
                    currencyCode?: string;
                    /** @default 21 */
                    vatRate?: number;
                    unit?: string | null;
                };
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        name: string;
                        description: string | null;
                        priceCents: number;
                        currencyCode: string;
                        vatRate: number;
                        unit: string | null;
                        isArchived: boolean;
                        createdAt: string;
                        updatedAt: string;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-products-delete": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {boolean} */
                        ok: true;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-products-update": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name?: string;
                    description?: string | null;
                    priceCents?: number;
                    currencyCode?: string;
                    vatRate?: number;
                    unit?: string | null;
                    isArchived?: boolean;
                };
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        name: string;
                        description: string | null;
                        priceCents: number;
                        currencyCode: string;
                        vatRate: number;
                        unit: string | null;
                        isArchived: boolean;
                        createdAt: string;
                        updatedAt: string;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-projects-list": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        code: string;
                        name: string;
                        color: string;
                        llmPrompt: string | null;
                        isArchived: boolean;
                        createdAt: string;
                        updatedAt: string;
                    }[];
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-projects-create": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    code: string;
                    name: string;
                    /** @default #000000 */
                    color?: string;
                    llmPrompt?: string | null;
                };
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        code: string;
                        name: string;
                        color: string;
                        llmPrompt: string | null;
                        isArchived: boolean;
                        createdAt: string;
                        updatedAt: string;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-projects-delete": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {boolean} */
                        ok: true;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-projects-update": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name?: string;
                    color?: string;
                    llmPrompt?: string | null;
                    isArchived?: boolean;
                };
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        code: string;
                        name: string;
                        color: string;
                        llmPrompt: string | null;
                        isArchived: boolean;
                        createdAt: string;
                        updatedAt: string;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-purchases-list": {
        parameters: {
            query?: {
                status?: "received" | "approved" | "paid" | "disputed" | "cancelled";
                limit?: number;
            };
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        /** Format: uuid */
                        contactId: string | null;
                        /** Format: uuid */
                        pdfFileId: string | null;
                        supplierInvoiceNumber: string;
                        /** @enum {string} */
                        status: "received" | "approved" | "paid" | "disputed" | "cancelled";
                        issueDate: string;
                        dueDate: string | null;
                        paidAt: string | null;
                        notes: string | null;
                        currencyCode: string;
                        totalCents: number | null;
                        irpfRate: number;
                        fxRateToEur: number | null;
                        fxRateDate: string | null;
                        fxRateSource: string | null;
                        items: {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            productId: string | null;
                            description: string;
                            quantity: number;
                            unitPriceCents: number;
                            vatRate: number;
                            position: number;
                        }[];
                        payments: {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            transactionId: string;
                            amountCents: number;
                            note: string | null;
                            source: string;
                            createdAt: string;
                        }[];
                        paidCents: number;
                        createdAt: string;
                        updatedAt: string;
                    }[];
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-purchases-create": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: uuid */
                    contactId?: string | null;
                    supplierInvoiceNumber: string;
                    /**
                     * @default received
                     * @enum {string}
                     */
                    status?: "received" | "approved" | "paid" | "disputed" | "cancelled";
                    issueDate: string;
                    dueDate?: string | null;
                    /** @default EUR */
                    currencyCode?: string;
                    totalCents?: number | null;
                    /** @default 0 */
                    irpfRate?: number;
                    fxRateToEur?: number | null;
                    fxRateDate?: string | null;
                    fxRateSource?: string | null;
                    notes?: string | null;
                    /** @default [] */
                    items?: {
                        /** Format: uuid */
                        productId?: string | null;
                        description: string;
                        /** @default 1 */
                        quantity?: number;
                        unitPriceCents: number;
                        /** @default 0 */
                        vatRate?: number;
                        /** @default 0 */
                        position?: number;
                    }[];
                };
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        /** Format: uuid */
                        contactId: string | null;
                        /** Format: uuid */
                        pdfFileId: string | null;
                        supplierInvoiceNumber: string;
                        /** @enum {string} */
                        status: "received" | "approved" | "paid" | "disputed" | "cancelled";
                        issueDate: string;
                        dueDate: string | null;
                        paidAt: string | null;
                        notes: string | null;
                        currencyCode: string;
                        totalCents: number | null;
                        irpfRate: number;
                        fxRateToEur: number | null;
                        fxRateDate: string | null;
                        fxRateSource: string | null;
                        items: {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            productId: string | null;
                            description: string;
                            quantity: number;
                            unitPriceCents: number;
                            vatRate: number;
                            position: number;
                        }[];
                        payments: {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            transactionId: string;
                            amountCents: number;
                            note: string | null;
                            source: string;
                            createdAt: string;
                        }[];
                        paidCents: number;
                        createdAt: string;
                        updatedAt: string;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-purchases-get": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        /** Format: uuid */
                        contactId: string | null;
                        /** Format: uuid */
                        pdfFileId: string | null;
                        supplierInvoiceNumber: string;
                        /** @enum {string} */
                        status: "received" | "approved" | "paid" | "disputed" | "cancelled";
                        issueDate: string;
                        dueDate: string | null;
                        paidAt: string | null;
                        notes: string | null;
                        currencyCode: string;
                        totalCents: number | null;
                        irpfRate: number;
                        fxRateToEur: number | null;
                        fxRateDate: string | null;
                        fxRateSource: string | null;
                        items: {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            productId: string | null;
                            description: string;
                            quantity: number;
                            unitPriceCents: number;
                            vatRate: number;
                            position: number;
                        }[];
                        payments: {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            transactionId: string;
                            amountCents: number;
                            note: string | null;
                            source: string;
                            createdAt: string;
                        }[];
                        paidCents: number;
                        createdAt: string;
                        updatedAt: string;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-purchases-delete": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {boolean} */
                        ok: true;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-purchases-allocatePayment": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
                purchaseId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: uuid */
                    transactionId: string;
                    amountCents: number;
                    note?: string | null;
                    /**
                     * @default manual
                     * @enum {string}
                     */
                    source?: "manual" | "rule" | "import";
                };
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        /** Format: uuid */
                        transactionId: string;
                        amountCents: number;
                        note: string | null;
                        source: string;
                        createdAt: string;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-purchases-removePayment": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
                purchaseId: string;
                paymentId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {boolean} */
                        ok: true;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-quotes-list": {
        parameters: {
            query?: {
                status?: "draft" | "sent" | "accepted" | "declined" | "expired";
                limit?: number;
            };
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        /** Format: uuid */
                        contactId: string | null;
                        /** Format: uuid */
                        templateId: string | null;
                        /** Format: uuid */
                        pdfFileId: string | null;
                        number: string;
                        /** @enum {string} */
                        status: "draft" | "sent" | "accepted" | "declined" | "expired";
                        issueDate: string;
                        expiryDate: string | null;
                        notes: string | null;
                        items: {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            productId: string | null;
                            description: string;
                            quantity: number;
                            unitPriceCents: number;
                            vatRate: number;
                            position: number;
                        }[];
                        createdAt: string;
                        updatedAt: string;
                    }[];
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-quotes-create": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: uuid */
                    contactId?: string | null;
                    /** Format: uuid */
                    templateId?: string | null;
                    number: string;
                    /**
                     * @default draft
                     * @enum {string}
                     */
                    status?: "draft" | "sent" | "accepted" | "declined" | "expired";
                    issueDate: string;
                    expiryDate?: string | null;
                    notes?: string | null;
                    /** @default [] */
                    items?: {
                        /** Format: uuid */
                        productId?: string | null;
                        description: string;
                        /** @default 1 */
                        quantity?: number;
                        unitPriceCents: number;
                        /** @default 21 */
                        vatRate?: number;
                        /** @default 0 */
                        position?: number;
                    }[];
                };
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        /** Format: uuid */
                        contactId: string | null;
                        /** Format: uuid */
                        templateId: string | null;
                        /** Format: uuid */
                        pdfFileId: string | null;
                        number: string;
                        /** @enum {string} */
                        status: "draft" | "sent" | "accepted" | "declined" | "expired";
                        issueDate: string;
                        expiryDate: string | null;
                        notes: string | null;
                        items: {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            productId: string | null;
                            description: string;
                            quantity: number;
                            unitPriceCents: number;
                            vatRate: number;
                            position: number;
                        }[];
                        createdAt: string;
                        updatedAt: string;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-quotes-get": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        /** Format: uuid */
                        contactId: string | null;
                        /** Format: uuid */
                        templateId: string | null;
                        /** Format: uuid */
                        pdfFileId: string | null;
                        number: string;
                        /** @enum {string} */
                        status: "draft" | "sent" | "accepted" | "declined" | "expired";
                        issueDate: string;
                        expiryDate: string | null;
                        notes: string | null;
                        items: {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            productId: string | null;
                            description: string;
                            quantity: number;
                            unitPriceCents: number;
                            vatRate: number;
                            position: number;
                        }[];
                        createdAt: string;
                        updatedAt: string;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-quotes-delete": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {boolean} */
                        ok: true;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-quotes-update": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: uuid */
                    contactId?: string | null;
                    /** Format: uuid */
                    templateId?: string | null;
                    /** @enum {string} */
                    status?: "draft" | "sent" | "accepted" | "declined" | "expired";
                    issueDate?: string;
                    expiryDate?: string | null;
                    notes?: string | null;
                    items?: {
                        /** Format: uuid */
                        productId?: string | null;
                        description: string;
                        /** @default 1 */
                        quantity?: number;
                        unitPriceCents: number;
                        /** @default 21 */
                        vatRate?: number;
                        /** @default 0 */
                        position?: number;
                    }[];
                };
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        /** Format: uuid */
                        contactId: string | null;
                        /** Format: uuid */
                        templateId: string | null;
                        /** Format: uuid */
                        pdfFileId: string | null;
                        number: string;
                        /** @enum {string} */
                        status: "draft" | "sent" | "accepted" | "declined" | "expired";
                        issueDate: string;
                        expiryDate: string | null;
                        notes: string | null;
                        items: {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            productId: string | null;
                            description: string;
                            quantity: number;
                            unitPriceCents: number;
                            vatRate: number;
                            position: number;
                        }[];
                        createdAt: string;
                        updatedAt: string;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-rules-list": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        /** @enum {string} */
                        matchType: "contains" | "regex" | "exact";
                        /** @enum {string} */
                        matchField: "merchant" | "description" | "name" | "text";
                        matchValue: string;
                        categoryCode: string | null;
                        projectCode: string | null;
                        isActive: boolean;
                        matchCount: number;
                        lastAppliedAt: string | null;
                        learnReason: string | null;
                        createdAt: string;
                        updatedAt: string;
                    }[];
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-rules-create": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    matchType: "contains" | "regex" | "exact";
                    /** @enum {string} */
                    matchField: "merchant" | "description" | "name" | "text";
                    matchValue: string;
                    categoryCode?: string | null;
                    projectCode?: string | null;
                    learnReason?: string | null;
                };
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        /** @enum {string} */
                        matchType: "contains" | "regex" | "exact";
                        /** @enum {string} */
                        matchField: "merchant" | "description" | "name" | "text";
                        matchValue: string;
                        categoryCode: string | null;
                        projectCode: string | null;
                        isActive: boolean;
                        matchCount: number;
                        lastAppliedAt: string | null;
                        learnReason: string | null;
                        createdAt: string;
                        updatedAt: string;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-rules-delete": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {boolean} */
                        ok: true;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-rules-update": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    categoryCode?: string | null;
                    projectCode?: string | null;
                    isActive?: boolean;
                };
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        /** @enum {string} */
                        matchType: "contains" | "regex" | "exact";
                        /** @enum {string} */
                        matchField: "merchant" | "description" | "name" | "text";
                        matchValue: string;
                        categoryCode: string | null;
                        projectCode: string | null;
                        isActive: boolean;
                        matchCount: number;
                        lastAppliedAt: string | null;
                        learnReason: string | null;
                        createdAt: string;
                        updatedAt: string;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-rules-applyAll": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        updatedCount: number;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-taxFilings-list": {
        parameters: {
            query?: {
                year?: number;
            };
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        year: number;
                        quarter: number | null;
                        modeloCode: string;
                        filedAt: string | null;
                        checklist?: unknown;
                        notes: string | null;
                        filedAmountCents: number | null;
                        confirmationNumber: string | null;
                        filingSource: string | null;
                        createdAt: string;
                        updatedAt: string;
                    }[];
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-taxFilings-create": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    year: number;
                    quarter?: number | null;
                    modeloCode: string;
                    checklist?: {
                        [key: string]: unknown;
                    };
                    notes?: string | null;
                };
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        year: number;
                        quarter: number | null;
                        modeloCode: string;
                        filedAt: string | null;
                        checklist?: unknown;
                        notes: string | null;
                        filedAmountCents: number | null;
                        confirmationNumber: string | null;
                        filingSource: string | null;
                        createdAt: string;
                        updatedAt: string;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-taxFilings-delete": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {boolean} */
                        ok: true;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-taxFilings-update": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    checklist?: {
                        [key: string]: unknown;
                    } | null;
                    notes?: string | null;
                };
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        year: number;
                        quarter: number | null;
                        modeloCode: string;
                        filedAt: string | null;
                        checklist?: unknown;
                        notes: string | null;
                        filedAmountCents: number | null;
                        confirmationNumber: string | null;
                        filingSource: string | null;
                        createdAt: string;
                        updatedAt: string;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-taxFilings-markFiled": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    filedAmountCents?: number | null;
                    confirmationNumber?: string | null;
                    filingSource?: string | null;
                    /** Format: date-time */
                    filedAt?: string;
                };
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        year: number;
                        quarter: number | null;
                        modeloCode: string;
                        filedAt: string | null;
                        checklist?: unknown;
                        notes: string | null;
                        filedAmountCents: number | null;
                        confirmationNumber: string | null;
                        filingSource: string | null;
                        createdAt: string;
                        updatedAt: string;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-transactions-list": {
        parameters: {
            query?: {
                type?: "expense" | "income" | "transfer";
                accountId?: string;
                categoryCode?: string;
                projectCode?: string;
                from?: string;
                to?: string;
                limit?: number;
            };
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        name: string | null;
                        description: string | null;
                        merchant: string | null;
                        note: string | null;
                        text: string | null;
                        totalCents: number | null;
                        currencyCode: string | null;
                        convertedTotalCents: number | null;
                        convertedCurrencyCode: string | null;
                        realizedFxGainCents: number | null;
                        /** @enum {string} */
                        type: "expense" | "income" | "transfer";
                        /** @enum {string} */
                        status: "business" | "personal" | "mixed";
                        deductible: boolean | null;
                        /** Format: uuid */
                        accountId: string | null;
                        /** Format: uuid */
                        counterAccountId: string | null;
                        categoryCode: string | null;
                        projectCode: string | null;
                        /** Format: uuid */
                        appliedRuleId: string | null;
                        /** Format: uuid */
                        transferId: string | null;
                        /** @enum {string|null} */
                        transferDirection: "outgoing" | "incoming" | null;
                        fileIds: string[];
                        items: unknown[];
                        extra?: unknown;
                        issuedAt: string | null;
                        createdAt: string;
                        updatedAt: string;
                    }[];
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-transactions-create": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name?: string | null;
                    description?: string | null;
                    merchant?: string | null;
                    note?: string | null;
                    totalCents?: number | null;
                    currencyCode?: string | null;
                    convertedTotalCents?: number | null;
                    convertedCurrencyCode?: string | null;
                    realizedFxGainCents?: number | null;
                    /**
                     * @default expense
                     * @enum {string}
                     */
                    type?: "expense" | "income" | "transfer";
                    /**
                     * @default business
                     * @enum {string}
                     */
                    status?: "business" | "personal" | "mixed";
                    deductible?: boolean | null;
                    /** Format: uuid */
                    accountId?: string | null;
                    /** Format: uuid */
                    counterAccountId?: string | null;
                    categoryCode?: string | null;
                    projectCode?: string | null;
                    /** Format: uuid */
                    transferId?: string | null;
                    /** @enum {string|null} */
                    transferDirection?: "outgoing" | "incoming" | null;
                    /** @default [] */
                    fileIds?: string[];
                    /** @default [] */
                    items?: {
                        [key: string]: unknown;
                    }[];
                    extra?: {
                        [key: string]: unknown;
                    } | null;
                    /** Format: date-time */
                    issuedAt?: string | null;
                };
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        name: string | null;
                        description: string | null;
                        merchant: string | null;
                        note: string | null;
                        text: string | null;
                        totalCents: number | null;
                        currencyCode: string | null;
                        convertedTotalCents: number | null;
                        convertedCurrencyCode: string | null;
                        realizedFxGainCents: number | null;
                        /** @enum {string} */
                        type: "expense" | "income" | "transfer";
                        /** @enum {string} */
                        status: "business" | "personal" | "mixed";
                        deductible: boolean | null;
                        /** Format: uuid */
                        accountId: string | null;
                        /** Format: uuid */
                        counterAccountId: string | null;
                        categoryCode: string | null;
                        projectCode: string | null;
                        /** Format: uuid */
                        appliedRuleId: string | null;
                        /** Format: uuid */
                        transferId: string | null;
                        /** @enum {string|null} */
                        transferDirection: "outgoing" | "incoming" | null;
                        fileIds: string[];
                        items: unknown[];
                        extra?: unknown;
                        issuedAt: string | null;
                        createdAt: string;
                        updatedAt: string;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-transactions-delete": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {boolean} */
                        ok: true;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
    "app-transactions-update": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tenantId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name?: string | null;
                    description?: string | null;
                    merchant?: string | null;
                    note?: string | null;
                    totalCents?: number | null;
                    currencyCode?: string | null;
                    /** @enum {string} */
                    type?: "expense" | "income" | "transfer";
                    /** @enum {string} */
                    status?: "business" | "personal" | "mixed";
                    deductible?: boolean | null;
                    /** Format: uuid */
                    accountId?: string | null;
                    categoryCode?: string | null;
                    projectCode?: string | null;
                    /** Format: date-time */
                    issuedAt?: string | null;
                };
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        name: string | null;
                        description: string | null;
                        merchant: string | null;
                        note: string | null;
                        text: string | null;
                        totalCents: number | null;
                        currencyCode: string | null;
                        convertedTotalCents: number | null;
                        convertedCurrencyCode: string | null;
                        realizedFxGainCents: number | null;
                        /** @enum {string} */
                        type: "expense" | "income" | "transfer";
                        /** @enum {string} */
                        status: "business" | "personal" | "mixed";
                        deductible: boolean | null;
                        /** Format: uuid */
                        accountId: string | null;
                        /** Format: uuid */
                        counterAccountId: string | null;
                        categoryCode: string | null;
                        projectCode: string | null;
                        /** Format: uuid */
                        appliedRuleId: string | null;
                        /** Format: uuid */
                        transferId: string | null;
                        /** @enum {string|null} */
                        transferDirection: "outgoing" | "incoming" | null;
                        fileIds: string[];
                        items: unknown[];
                        extra?: unknown;
                        issuedAt: string | null;
                        createdAt: string;
                        updatedAt: string;
                    };
                };
            };
            default: components["responses"]["error"];
        };
    };
}

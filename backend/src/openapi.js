const errorSchema = {
  type: 'object',
  properties: {
    error: { type: 'string' },
  },
};

const userSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer', example: 1 },
    email: { type: 'string', format: 'email', example: 'alice@example.com' },
    displayName: { type: 'string', example: 'Alice Ng' },
  },
};

const accountSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer', example: 1 },
    userId: { type: 'integer', example: 1 },
    iban: { type: 'string', example: 'GB29NWBK60161331926819' },
    balance: { type: 'number', format: 'decimal', example: 2450.75 },
    currency: { type: 'string', example: 'GBP' },
  },
};

const transactionSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer', example: 1 },
    accountId: { type: 'integer', example: 1 },
    amount: { type: 'number', format: 'decimal', example: -42.5 },
    description: { type: 'string', example: 'Tesco Superstore' },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

// Returned by the gateway, not this backend
const unauthorizedResponse = {
  description: 'Missing, invalid, expired, or wrong-algorithm JWT - rejected by the gateway before reaching this route',
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          error: { type: 'string', example: 'unauthorized' },
          reason: {
            type: 'string',
            enum: ['missing_token', 'expired_token', 'invalid_signature', 'disallowed_algorithm', 'invalid_token'],
          },
        },
      },
    },
  },
};

// Also returned by the gateway, not this backend.
const injectionBlockedResponse = {
  description: 'Request matched an R1 SQL/NoSQL injection signature - blocked by the gateway before reaching this route',
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          error: { type: 'string', example: 'blocked by IDS' },
          ruleId: { type: 'string', example: 'R1' },
          signature: { type: 'string', example: 'sql-tautology' },
        },
      },
    },
  },
};

module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'api-gateway-ids stub backend',
    version: '0.1.0',
  },

  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'RS256 JWT, enforced by the gateway (not the backend itself) on every route except /health, ' +
          '/api/auth/register, /api/auth/login, and /docs. Obtain one from POST /api/auth/login.',
      },
    },
  },

  tags: [
    { name: 'health', description: 'Liveness checks' },
    { name: 'auth', description: 'Brute force / credential stuffing target (API2)' },
    { name: 'users', description: 'BOLA / enumeration target (API1)' },
    { name: 'accounts', description: 'BOLA / enumeration target (API1)' },
    { name: 'transactions', description: 'Injection target (API8)' },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['health'],
        summary: 'Liveness check',
        responses: {
          200: {
            description: 'Service is up',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                    service: { type: 'string', example: 'backend' },
                    uptime: { type: 'number' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/auth/register': {
      post: {
        tags: ['auth'],
        summary: 'Register a new account (not persisted)',
        description: 'Exists for endpoint-shape completeness only; the created account is not written to the database.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', format: 'password' },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Account created (not persisted)',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string', example: 'account created' },
                    email: { type: 'string' },
                  },
                },
              },
            },
          },
          400: { description: 'Missing email or password', content: { 'application/json': { schema: errorSchema } } },
          409: { description: 'Email already registered', content: { 'application/json': { schema: errorSchema } } },
        },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['auth'],
        summary: 'Log in and receive a signed JWT',
        description:
          'Returns an RS256 JWT (15-minute expiry) signed by the backend, verified by the gateway on every ' +
          'protected route. Use it as `Authorization: Bearer <token>`. Seeded credentials: alice@example.com / ' +
          "bob@example.com / chloe@example.com, all with password 'Password123!' (see docs/api-endpoints.md).",
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', format: 'password' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Authenticated',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    token: {
                      type: 'string',
                      example: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImFsaWNlQGV4YW1wbGUuY29tIiwic3ViIjoiMSJ9...',
                    },
                    user: userSchema,
                  },
                },
              },
            },
          },
          400: { description: 'Missing email or password', content: { 'application/json': { schema: errorSchema } } },
          401: { description: 'Invalid credentials', content: { 'application/json': { schema: errorSchema } } },
        },
      },
    },
    '/api/users/{id}': {
      get: {
        tags: ['users'],
        summary: 'Fetch a user by ID',
        description:
          'JWT-protected (enforced by the gateway), but sequential/guessable IDs and no ownership check on ' +
          'purpose - any authenticated user can fetch any other user. This is the BOLA enumeration target (R5, not yet built).',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, example: 1 },
        ],
        responses: {
          200: { description: 'User found', content: { 'application/json': { schema: userSchema } } },
          401: unauthorizedResponse,
          404: { description: 'User not found', content: { 'application/json': { schema: errorSchema } } },
        },
      },
    },
    '/api/accounts/{id}': {
      get: {
        tags: ['accounts'],
        summary: 'Fetch an account by ID',
        description:
          'JWT-protected (enforced by the gateway), but sequential/guessable IDs and no ownership check on ' +
          'purpose - this is the BOLA enumeration target (R5, not yet built).',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, example: 1 },
        ],
        responses: {
          200: { description: 'Account found', content: { 'application/json': { schema: accountSchema } } },
          401: unauthorizedResponse,
          404: { description: 'Account not found', content: { 'application/json': { schema: errorSchema } } },
        },
      },
    },
    '/api/accounts/{id}/transactions': {
      get: {
        tags: ['accounts', 'transactions'],
        summary: "List an account's transactions",
        description: 'JWT-protected. Read-side BOLA variant, one level deeper than /api/accounts/{id}.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, example: 1 },
        ],
        responses: {
          200: {
            description: 'Transactions for the account',
            content: { 'application/json': { schema: { type: 'array', items: transactionSchema } } },
          },
          401: unauthorizedResponse,
          404: { description: 'Account not found', content: { 'application/json': { schema: errorSchema } } },
        },
      },
      post: {
        tags: ['accounts', 'transactions'],
        summary: 'Add a transaction to an account',
        description: 'JWT-protected. Write-side BOLA variant - no ownership check on purpose. Body is also scanned by R1.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, example: 1 },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['amount'],
                properties: {
                  amount: { type: 'number', example: -9.99 },
                  description: { type: 'string', example: 'Coffee' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Transaction created', content: { 'application/json': { schema: transactionSchema } } },
          400: { description: 'amount missing or not a number', content: { 'application/json': { schema: errorSchema } } },
          401: unauthorizedResponse,
          403: injectionBlockedResponse,
          404: { description: 'Account not found', content: { 'application/json': { schema: errorSchema } } },
        },
      },
    },
    '/api/transactions/search': {
      get: {
        tags: ['transactions'],
        summary: 'Free-text search across all transactions',
        description:
          'JWT-protected. Query param is deliberately unsanitised beyond basic type checks - this is the R1 ' +
          '(SQL/NoSQL injection) target. Payloads matching an injection signature are blocked by the gateway ' +
          'with 403 before reaching this route.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'q', in: 'query', required: false, schema: { type: 'string' }, example: 'Tesco' },
        ],
        responses: {
          200: {
            description: 'Matching transactions (or all, if q is omitted)',
            content: { 'application/json': { schema: { type: 'array', items: transactionSchema } } },
          },
          401: unauthorizedResponse,
          403: injectionBlockedResponse,
        },
      },
    },
  },
};

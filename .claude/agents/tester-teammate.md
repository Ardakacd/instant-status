---
name: tester-teammate
description: Testing teammate for Instant Status. Writes and runs tests for both backend and mobile. Works only in test files across both directories.
tools: Read, Edit, Write, Bash, Grep, Glob
model: sonnet
color: cyan
memory: project
hooks:
  PreToolUse:
    - matcher: "Edit|Write"
      hooks:
        - type: command
          command: .claude/hooks/guard-tester.sh
---

# Tester Teammate — Instant Status

## Ownership
- backend/src/**/*.spec.ts
- backend/test/**
- mobile/src/**/*.test.ts, mobile/src/**/*.test.tsx
- mobile/__tests__/**
- NOT any non-test source file — read-only access to source

## Test file placement
- **Backend**: co-located next to source file — `auth.service.spec.ts` beside `auth.service.ts`
- **Mobile**: co-located next to source file — `useIsPremium.test.ts` beside `useIsPremium.ts`

## Available libraries

### Backend
- **Jest** with `ts-jest` transform
- **@nestjs/testing** — `Test.createTestingModule()` for DI setup
- Run: `cd backend && npm test`

### Mobile
- **Jest** with `jest-expo` preset
- **@testing-library/react-native** — `render`, `screen`, `fireEvent`, `waitFor`
- **@testing-library/jest-native** — extended matchers
- Run: `cd mobile && npm test`

## Starting from scratch
There are currently zero test files. When asked to test something:
1. Read the source file you're asked to test
2. Identify the public API (exports, methods, return types)
3. Write tests covering: happy path, edge cases, error paths
4. Run tests and fix all failures before reporting done

## Test priority guide
Start with the most testable, highest-value targets:
1. **Pure utils** — `premium.ts`, `redact.ts` (no mocks needed)
2. **Services** — business logic with mocked deps
3. **Hooks** (mobile) — with `renderHook` from testing library
4. **Controllers** (backend) — integration-style with NestJS testing module

## What to mock

### Backend
```typescript
// Firebase Admin SDK — never call real Firebase
const mockFirebaseAdmin = {
  auth: () => ({
    verifyIdToken: jest.fn(),
    getUser: jest.fn(),
    deleteUser: jest.fn(),
  }),
};

// TypeORM repository
const mockRepository = {
  find: jest.fn(),
  findOne: jest.fn(),
  save: jest.fn(),
  delete: jest.fn(),
  create: jest.fn(),
};

// NestJS testing module setup
const module = await Test.createTestingModule({
  providers: [
    MyService,
    { provide: getRepositoryToken(Entity), useValue: mockRepository },
  ],
}).compile();
```

- **Postmark** — never send real emails, mock `EmailService`
- **RevenueCat webhooks** — use test payloads, mock `ProcessedWebhook` repository

### Mobile
```typescript
// Mock API instance
jest.mock("../config/api", () => ({
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
  getFreshToken: jest.fn(),
}));

// Mock Firebase auth
jest.mock("../config/firebase", () => ({
  auth: { currentUser: { getIdToken: jest.fn() } },
}));
```

- **AsyncStorage** — jest-expo auto-mocks this
- **RevenueCat SDK** — mock `react-native-purchases`
- **Sentry** — mock the default export: `jest.mock("../../sentry")`
- **useIsPremium** — mock return value per test case
- **Toast** — mock `react-native-toast-message`

## Test structure
```typescript
describe("ServiceName", () => {
  let service: MyService;
  let mockRepo: jest.Mocked<Repository<Entity>>;

  beforeEach(async () => {
    // Fresh mocks per test
    const module = await Test.createTestingModule({...}).compile();
    service = module.get(MyService);
  });

  describe("methodName", () => {
    it("should return X when given valid input", async () => {
      mockRepo.findOne.mockResolvedValue(mockEntity);
      const result = await service.methodName(input);
      expect(result).toEqual(expected);
    });

    it("should throw NotFoundException when entity missing", async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.methodName(input)).rejects.toThrow(NotFoundException);
    });
  });
});
```

## Verification — mandatory after writing tests
```bash
cd backend && npm test
cd mobile && npm test
```

Report format:
```
Backend: 12 passing, 0 failing
Mobile: 8 passing, 0 failing
```
If any fail, fix them before reporting. Include test names and error details for any issues you cannot resolve.

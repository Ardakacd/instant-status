import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { StatusOptionService } from '../status-option.service';
import { StatusOption } from '../../entities/status-option.entity';
import { Status } from '../../entities/status.entity';
import { UserService } from '../../user/user.service';
import { MAX_CUSTOM_STATUS_OPTIONS } from '../status-option.constants';
import { PREMIUM_GRACE_PERIOD_MS } from '../../utils/premium';

// ─── Helpers ────────────────────────────────────────────────────────────────

const USER_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const OTHER_USER_ID = 'bbbbbbbb-0000-0000-0000-000000000002';
const SYSTEM_OPT_ID = 'cccccccc-0000-0000-0000-000000000003';
const CUSTOM_OPT_ID = 'dddddddd-0000-0000-0000-000000000004';
const DEFAULT_OPT_ID = 'eeeeeeee-0000-0000-0000-000000000005';

const makeSystemOption = (overrides: Partial<StatusOption> = {}): StatusOption =>
  ({
    id: SYSTEM_OPT_ID,
    user_id: null,
    label: 'Available',
    emoji: '✅',
    color: '#10B981',
    sort_order: 0,
    user: null,
    ...overrides,
  } as StatusOption);

const makeCustomOption = (userId = USER_ID, overrides: Partial<StatusOption> = {}): StatusOption =>
  ({
    id: CUSTOM_OPT_ID,
    user_id: userId,
    label: 'Gaming',
    emoji: '🎮',
    color: '#FF5733',
    sort_order: 1000,
    user: null,
    ...overrides,
  } as StatusOption);

const makePremiumUser = () => ({
  id: USER_ID,
  premium_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days future
});

const makeGraceUser = () => ({
  id: USER_ID,
  premium_until: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // expired 1 day ago (within 3-day grace)
});

const makeExpiredUser = () => ({
  id: USER_ID,
  premium_until: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000), // expired 4 days ago (past grace)
});

const makeNoPremiumUser = () => ({
  id: USER_ID,
  premium_until: null,
});

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockStatusOptionRepository = {
  find: jest.fn(),
  findOne: jest.fn(),
  count: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  remove: jest.fn(),
  update: jest.fn(),
  createQueryBuilder: jest.fn(),
};

const mockTransactionStatusRepo = {
  find: jest.fn(),
  update: jest.fn(),
};

const mockTransactionStatusOptionRepo = {
  findOne: jest.fn(),
  remove: jest.fn(),
};

const mockTransactionManager = {
  getRepository: jest.fn((entity) => {
    if (entity === Status) return mockTransactionStatusRepo;
    if (entity === StatusOption) return mockTransactionStatusOptionRepo;
  }),
};

const mockDataSource = {
  transaction: jest.fn(async (cb: (manager: any) => Promise<any>) =>
    cb(mockTransactionManager)
  ),
};

const mockUserService = {
  findById: jest.fn(),
};

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('StatusOptionService', () => {
  let service: StatusOptionService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Default createQueryBuilder chain for sort_order lookup
    mockStatusOptionRepository.createQueryBuilder.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ max: null }),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StatusOptionService,
        { provide: getRepositoryToken(StatusOption), useValue: mockStatusOptionRepository },
        { provide: DataSource, useValue: mockDataSource },
        { provide: UserService, useValue: mockUserService },
      ],
    }).compile();

    service = module.get<StatusOptionService>(StatusOptionService);
  });

  // ── getUserStatusOptions ──────────────────────────────────────────────────

  describe('getUserStatusOptions', () => {
    it('returns system options first, then user custom options', async () => {
      const systemOpt = makeSystemOption({ sort_order: 0 });
      const customOpt = makeCustomOption(USER_ID, { sort_order: 1000 });
      mockStatusOptionRepository.find.mockResolvedValue([systemOpt, customOpt]);

      const result = await service.getUserStatusOptions(USER_ID);

      expect(result).toEqual([systemOpt, customOpt]);
      expect(result[0].user_id).toBeNull();
      expect(result[1].user_id).toBe(USER_ID);
    });

    it('puts system options before custom options even if custom has lower sort_order', async () => {
      const customOpt = makeCustomOption(USER_ID, { sort_order: 1 });
      const systemOpt = makeSystemOption({ sort_order: 10 });
      // DB returns them in whatever order; service reorders in-memory
      mockStatusOptionRepository.find.mockResolvedValue([customOpt, systemOpt]);

      const result = await service.getUserStatusOptions(USER_ID);

      expect(result[0].user_id).toBeNull(); // system first
      expect(result[1].user_id).toBe(USER_ID); // custom second
    });

    it('returns only system options when user has no custom options', async () => {
      const systemOpt = makeSystemOption();
      mockStatusOptionRepository.find.mockResolvedValue([systemOpt]);

      const result = await service.getUserStatusOptions(USER_ID);
      expect(result).toEqual([systemOpt]);
    });

    it('throws InternalServerErrorException on DB error', async () => {
      mockStatusOptionRepository.find.mockRejectedValue(new Error('DB error'));
      await expect(service.getUserStatusOptions(USER_ID)).rejects.toThrow(
        InternalServerErrorException
      );
    });
  });

  // ── getStatusOptionById ───────────────────────────────────────────────────

  describe('getStatusOptionById', () => {
    it('returns a system option (user_id null) for any user', async () => {
      const systemOpt = makeSystemOption();
      mockStatusOptionRepository.findOne.mockResolvedValue(systemOpt);

      const result = await service.getStatusOptionById(SYSTEM_OPT_ID, USER_ID);
      expect(result).toEqual(systemOpt);
    });

    it("returns user's own custom option", async () => {
      const customOpt = makeCustomOption(USER_ID);
      mockStatusOptionRepository.findOne.mockResolvedValue(customOpt);

      const result = await service.getStatusOptionById(CUSTOM_OPT_ID, USER_ID);
      expect(result).toEqual(customOpt);
    });

    it('throws NotFoundException when option not found', async () => {
      mockStatusOptionRepository.findOne.mockResolvedValue(null);
      await expect(service.getStatusOptionById('some-id', USER_ID)).rejects.toThrow(
        NotFoundException
      );
    });

    it('throws NotFoundException when option belongs to another user', async () => {
      const otherUserOpt = makeCustomOption(OTHER_USER_ID);
      mockStatusOptionRepository.findOne.mockResolvedValue(otherUserOpt);

      await expect(service.getStatusOptionById(CUSTOM_OPT_ID, USER_ID)).rejects.toThrow(
        NotFoundException
      );
    });

    it('throws InternalServerErrorException on unexpected DB error', async () => {
      mockStatusOptionRepository.findOne.mockRejectedValue(new Error('DB error'));
      await expect(service.getStatusOptionById(CUSTOM_OPT_ID, USER_ID)).rejects.toThrow(
        InternalServerErrorException
      );
    });
  });

  // ── createCustomStatusOption ──────────────────────────────────────────────

  describe('createCustomStatusOption', () => {
    beforeEach(() => {
      mockStatusOptionRepository.count.mockResolvedValue(0);
      const created = makeCustomOption(USER_ID);
      mockStatusOptionRepository.create.mockReturnValue(created);
      mockStatusOptionRepository.save.mockResolvedValue(created);
    });

    it('creates a custom option for a premium user', async () => {
      mockUserService.findById.mockResolvedValue(makePremiumUser());

      const result = await service.createCustomStatusOption(USER_ID, 'Gaming', '🎮', '#FF5733');
      expect(result).toBeDefined();
      expect(mockStatusOptionRepository.save).toHaveBeenCalled();
    });

    it('allows creation during grace period', async () => {
      mockUserService.findById.mockResolvedValue(makeGraceUser());

      const result = await service.createCustomStatusOption(USER_ID, 'Gaming', '🎮', '#FF5733');
      expect(result).toBeDefined();
    });

    it('throws BadRequestException for user with no premium', async () => {
      mockUserService.findById.mockResolvedValue(makeNoPremiumUser());

      await expect(
        service.createCustomStatusOption(USER_ID, 'Gaming', '🎮', '#FF5733')
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for user with expired premium past grace period', async () => {
      mockUserService.findById.mockResolvedValue(makeExpiredUser());

      await expect(
        service.createCustomStatusOption(USER_ID, 'Gaming', '🎮', '#FF5733')
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when at max custom options limit', async () => {
      mockUserService.findById.mockResolvedValue(makePremiumUser());
      mockStatusOptionRepository.count.mockResolvedValue(MAX_CUSTOM_STATUS_OPTIONS);

      await expect(
        service.createCustomStatusOption(USER_ID, 'Gaming', '🎮', '#FF5733')
      ).rejects.toThrow(BadRequestException);
    });

    it('uses auto sort_order of 1000 when no existing custom options', async () => {
      mockUserService.findById.mockResolvedValue(makePremiumUser());
      // max returns null (no existing custom options)
      mockStatusOptionRepository.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ max: null }),
      });

      await service.createCustomStatusOption(USER_ID, 'Gaming', '🎮', '#FF5733');

      expect(mockStatusOptionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ sort_order: 1000 })
      );
    });

    it('uses max + 1 for sort_order when existing custom options exist', async () => {
      mockUserService.findById.mockResolvedValue(makePremiumUser());
      mockStatusOptionRepository.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ max: 1002 }),
      });

      await service.createCustomStatusOption(USER_ID, 'Gaming', '🎮', '#FF5733');

      expect(mockStatusOptionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ sort_order: 1003 })
      );
    });

    it('uses provided sort_order when given', async () => {
      mockUserService.findById.mockResolvedValue(makePremiumUser());

      await service.createCustomStatusOption(USER_ID, 'Gaming', '🎮', '#FF5733', 5);

      expect(mockStatusOptionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ sort_order: 5 })
      );
    });

    it('trims label and emoji, uppercases color', async () => {
      mockUserService.findById.mockResolvedValue(makePremiumUser());

      await service.createCustomStatusOption(USER_ID, '  Gaming  ', ' 🎮 ', '#ff5733');

      expect(mockStatusOptionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          label: 'Gaming',
          emoji: '🎮',
          color: '#FF5733',
        })
      );
    });

    it('throws InternalServerErrorException on unexpected DB error', async () => {
      mockUserService.findById.mockResolvedValue(makePremiumUser());
      mockStatusOptionRepository.save.mockRejectedValue(new Error('DB error'));

      await expect(
        service.createCustomStatusOption(USER_ID, 'Gaming', '🎮', '#FF5733')
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  // ── updateCustomStatusOption ──────────────────────────────────────────────

  describe('updateCustomStatusOption', () => {
    let customOpt: StatusOption;

    beforeEach(() => {
      customOpt = makeCustomOption(USER_ID);
      mockStatusOptionRepository.findOne.mockResolvedValue(customOpt);
      mockUserService.findById.mockResolvedValue(makePremiumUser());
      mockStatusOptionRepository.save.mockResolvedValue(customOpt);
    });

    it('updates own custom option for premium user', async () => {
      const result = await service.updateCustomStatusOption(CUSTOM_OPT_ID, USER_ID, {
        label: 'Streaming',
      });
      expect(result).toBeDefined();
      expect(mockStatusOptionRepository.save).toHaveBeenCalled();
    });

    it('throws NotFoundException when option not found', async () => {
      mockStatusOptionRepository.findOne.mockResolvedValue(null);
      await expect(
        service.updateCustomStatusOption(CUSTOM_OPT_ID, USER_ID, { label: 'X' })
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when trying to update a system option', async () => {
      const systemOpt = makeSystemOption();
      mockStatusOptionRepository.findOne.mockResolvedValue(systemOpt);

      await expect(
        service.updateCustomStatusOption(SYSTEM_OPT_ID, USER_ID, { label: 'X' })
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when option belongs to another user', async () => {
      const otherOpt = makeCustomOption(OTHER_USER_ID);
      mockStatusOptionRepository.findOne.mockResolvedValue(otherOpt);

      await expect(
        service.updateCustomStatusOption(CUSTOM_OPT_ID, USER_ID, { label: 'X' })
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException for non-premium user', async () => {
      mockUserService.findById.mockResolvedValue(makeNoPremiumUser());

      await expect(
        service.updateCustomStatusOption(CUSTOM_OPT_ID, USER_ID, { label: 'X' })
      ).rejects.toThrow(BadRequestException);
    });

    it('trims label, trims emoji, uppercases color on update', async () => {
      await service.updateCustomStatusOption(CUSTOM_OPT_ID, USER_ID, {
        label: '  Streaming  ',
        emoji: ' 📺 ',
        color: '#aabbcc',
      });

      expect(customOpt.label).toBe('Streaming');
      expect(customOpt.emoji).toBe('📺');
      expect(customOpt.color).toBe('#AABBCC');
    });

    it('updates sort_order when provided', async () => {
      await service.updateCustomStatusOption(CUSTOM_OPT_ID, USER_ID, { sort_order: 999 });
      expect(customOpt.sort_order).toBe(999);
    });

    it('does not overwrite fields that are not provided', async () => {
      const originalLabel = customOpt.label;
      await service.updateCustomStatusOption(CUSTOM_OPT_ID, USER_ID, { sort_order: 999 });
      expect(customOpt.label).toBe(originalLabel);
    });

    it('throws InternalServerErrorException on unexpected DB error', async () => {
      mockStatusOptionRepository.save.mockRejectedValue(new Error('DB error'));
      await expect(
        service.updateCustomStatusOption(CUSTOM_OPT_ID, USER_ID, { label: 'X' })
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  // ── deleteCustomStatusOption ──────────────────────────────────────────────

  describe('deleteCustomStatusOption', () => {
    let customOpt: StatusOption;

    beforeEach(() => {
      customOpt = makeCustomOption(USER_ID);
      mockStatusOptionRepository.findOne.mockResolvedValue(customOpt);
      mockTransactionStatusRepo.find.mockResolvedValue([]);
      mockTransactionStatusOptionRepo.remove.mockResolvedValue(undefined);
    });

    it('deletes own custom option when no statuses use it', async () => {
      await expect(
        service.deleteCustomStatusOption(CUSTOM_OPT_ID, USER_ID)
      ).resolves.toBeUndefined();

      expect(mockTransactionStatusOptionRepo.remove).toHaveBeenCalledWith(customOpt);
    });

    it('reassigns statuses using the deleted option to default Available before deleting', async () => {
      const statusUsingOption = { id: 'status-id', option_id: CUSTOM_OPT_ID };
      mockTransactionStatusRepo.find.mockResolvedValue([statusUsingOption]);
      const defaultOpt = makeSystemOption({ id: DEFAULT_OPT_ID });
      mockTransactionStatusOptionRepo.findOne.mockResolvedValue(defaultOpt);
      mockTransactionStatusRepo.update.mockResolvedValue(undefined);

      await service.deleteCustomStatusOption(CUSTOM_OPT_ID, USER_ID);

      expect(mockTransactionStatusRepo.update).toHaveBeenCalledWith(
        { option_id: CUSTOM_OPT_ID },
        { option_id: DEFAULT_OPT_ID }
      );
      expect(mockTransactionStatusOptionRepo.remove).toHaveBeenCalledWith(customOpt);
    });

    it('throws InternalServerErrorException when default option is missing and statuses are in use', async () => {
      mockTransactionStatusRepo.find.mockResolvedValue([{ id: 'status-id' }]);
      mockTransactionStatusOptionRepo.findOne.mockResolvedValue(null); // no default

      await expect(
        service.deleteCustomStatusOption(CUSTOM_OPT_ID, USER_ID)
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('throws NotFoundException when option not found', async () => {
      mockStatusOptionRepository.findOne.mockResolvedValue(null);
      await expect(
        service.deleteCustomStatusOption(CUSTOM_OPT_ID, USER_ID)
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when trying to delete a system option', async () => {
      const systemOpt = makeSystemOption();
      mockStatusOptionRepository.findOne.mockResolvedValue(systemOpt);

      await expect(
        service.deleteCustomStatusOption(SYSTEM_OPT_ID, USER_ID)
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when option belongs to another user', async () => {
      const otherOpt = makeCustomOption(OTHER_USER_ID);
      mockStatusOptionRepository.findOne.mockResolvedValue(otherOpt);

      await expect(
        service.deleteCustomStatusOption(CUSTOM_OPT_ID, USER_ID)
      ).rejects.toThrow(NotFoundException);
    });

    it('throws InternalServerErrorException on unexpected DB error', async () => {
      mockDataSource.transaction.mockRejectedValue(new Error('DB error'));

      await expect(
        service.deleteCustomStatusOption(CUSTOM_OPT_ID, USER_ID)
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  // ── getDefaultStatusOption ────────────────────────────────────────────────

  describe('getDefaultStatusOption', () => {
    it('returns the Available system option', async () => {
      const defaultOpt = makeSystemOption();
      mockStatusOptionRepository.findOne.mockResolvedValue(defaultOpt);

      const result = await service.getDefaultStatusOption();
      expect(result).toEqual(defaultOpt);
      expect(mockStatusOptionRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ label: 'Available' }) })
      );
    });

    it('returns null on DB error', async () => {
      mockStatusOptionRepository.findOne.mockRejectedValue(new Error('DB error'));
      const result = await service.getDefaultStatusOption();
      expect(result).toBeNull();
    });
  });
});

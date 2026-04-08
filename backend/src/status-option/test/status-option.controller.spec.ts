import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { StatusOptionController } from '../status-option.controller';
import { StatusOptionService } from '../status-option.service';
import { StatusOption } from '../../entities/status-option.entity';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const USER_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const VALID_UUID = 'bbbbbbbb-0000-0000-0000-000000000002';

const mockStatusOptionService = {
  getUserStatusOptions: jest.fn(),
  getStatusOptionById: jest.fn(),
  createCustomStatusOption: jest.fn(),
  updateCustomStatusOption: jest.fn(),
  deleteCustomStatusOption: jest.fn(),
};

const makeReq = (userId = USER_ID) => ({ user: { id: userId } });

const makeOption = (overrides: Partial<StatusOption> = {}): StatusOption =>
  ({
    id: VALID_UUID,
    user_id: USER_ID,
    label: 'Gaming',
    emoji: '🎮',
    color: '#FF5733',
    sort_order: 1000,
    user: null,
    ...overrides,
  } as StatusOption);

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('StatusOptionController', () => {
  let controller: StatusOptionController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StatusOptionController],
      providers: [
        { provide: StatusOptionService, useValue: mockStatusOptionService },
        // Bypass AuthGuard for unit tests
        { provide: APP_GUARD, useValue: { canActivate: () => true } },
      ],
    })
      .overrideGuard(require('../../auth/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<StatusOptionController>(StatusOptionController);
  });

  // ── GET /status-options ───────────────────────────────────────────────────

  describe('getStatusOptions', () => {
    it('calls service with the authenticated user id', async () => {
      const options = [makeOption()];
      mockStatusOptionService.getUserStatusOptions.mockResolvedValue(options);

      const result = await controller.getStatusOptions(makeReq());

      expect(mockStatusOptionService.getUserStatusOptions).toHaveBeenCalledWith(USER_ID);
      expect(result).toEqual(options);
    });

    it('propagates service errors', async () => {
      mockStatusOptionService.getUserStatusOptions.mockRejectedValue(
        new Error('DB error')
      );

      await expect(controller.getStatusOptions(makeReq())).rejects.toThrow('DB error');
    });
  });

  // ── GET /status-options/:id ───────────────────────────────────────────────

  describe('getStatusOption', () => {
    it('calls service with parsed UUID and user id', async () => {
      const option = makeOption({ id: VALID_UUID });
      mockStatusOptionService.getStatusOptionById.mockResolvedValue(option);

      const result = await controller.getStatusOption(makeReq(), VALID_UUID);

      expect(mockStatusOptionService.getStatusOptionById).toHaveBeenCalledWith(
        VALID_UUID,
        USER_ID
      );
      expect(result).toEqual(option);
    });

    it('throws ZodError for invalid UUID param', async () => {
      await expect(
        controller.getStatusOption(makeReq(), 'not-a-uuid')
      ).rejects.toThrow();
    });

    it('propagates NotFoundException from service', async () => {
      mockStatusOptionService.getStatusOptionById.mockRejectedValue(
        new NotFoundException('Status option not found')
      );

      await expect(
        controller.getStatusOption(makeReq(), VALID_UUID)
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── POST /status-options ──────────────────────────────────────────────────

  describe('createStatusOption', () => {
    const validBody = {
      label: 'Gaming',
      emoji: '🎮',
      color: '#FF5733',
    };

    it('calls service with validated fields', async () => {
      const created = makeOption();
      mockStatusOptionService.createCustomStatusOption.mockResolvedValue(created);

      const result = await controller.createStatusOption(makeReq(), validBody);

      expect(mockStatusOptionService.createCustomStatusOption).toHaveBeenCalledWith(
        USER_ID,
        'Gaming',
        '🎮',
        '#FF5733',
        undefined
      );
      expect(result).toEqual(created);
    });

    it('passes sort_order when provided', async () => {
      mockStatusOptionService.createCustomStatusOption.mockResolvedValue(makeOption());

      await controller.createStatusOption(makeReq(), { ...validBody, sort_order: 5 });

      expect(mockStatusOptionService.createCustomStatusOption).toHaveBeenCalledWith(
        USER_ID,
        'Gaming',
        '🎮',
        '#FF5733',
        5
      );
    });

    it('throws ZodError when label is missing', async () => {
      const { label: _label, ...noLabel } = validBody;
      await expect(controller.createStatusOption(makeReq(), noLabel)).rejects.toThrow();
    });

    it('throws ZodError when emoji is missing', async () => {
      const { emoji: _emoji, ...noEmoji } = validBody;
      await expect(controller.createStatusOption(makeReq(), noEmoji)).rejects.toThrow();
    });

    it('throws ZodError when color is missing', async () => {
      const { color: _color, ...noColor } = validBody;
      await expect(controller.createStatusOption(makeReq(), noColor)).rejects.toThrow();
    });

    it('throws ZodError for invalid color format', async () => {
      await expect(
        controller.createStatusOption(makeReq(), { ...validBody, color: 'red' })
      ).rejects.toThrow();
    });

    it('throws ZodError for label longer than 25 characters', async () => {
      await expect(
        controller.createStatusOption(makeReq(), {
          ...validBody,
          label: 'a'.repeat(26),
        })
      ).rejects.toThrow();
    });

    it('throws ZodError for unknown fields (strict schema)', async () => {
      await expect(
        controller.createStatusOption(makeReq(), { ...validBody, unknown_field: 'x' })
      ).rejects.toThrow();
    });

    it('accepts short hex color #FFF', async () => {
      mockStatusOptionService.createCustomStatusOption.mockResolvedValue(makeOption());

      await expect(
        controller.createStatusOption(makeReq(), { ...validBody, color: '#FFF' })
      ).resolves.toBeDefined();
    });

    it('propagates BadRequestException from service (non-premium)', async () => {
      mockStatusOptionService.createCustomStatusOption.mockRejectedValue(
        new BadRequestException('Upgrade to create custom statuses')
      );

      await expect(
        controller.createStatusOption(makeReq(), validBody)
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── PATCH /status-options/:id ─────────────────────────────────────────────

  describe('updateStatusOption', () => {
    it('calls service with UUID, user id, and validated updates', async () => {
      const updated = makeOption({ label: 'Streaming' });
      mockStatusOptionService.updateCustomStatusOption.mockResolvedValue(updated);

      const result = await controller.updateStatusOption(makeReq(), VALID_UUID, {
        label: 'Streaming',
      });

      expect(mockStatusOptionService.updateCustomStatusOption).toHaveBeenCalledWith(
        VALID_UUID,
        USER_ID,
        { label: 'Streaming' }
      );
      expect(result).toEqual(updated);
    });

    it('throws ZodError for invalid UUID param', async () => {
      await expect(
        controller.updateStatusOption(makeReq(), 'bad-id', { label: 'X' })
      ).rejects.toThrow();
    });

    it('throws ZodError for invalid color in update', async () => {
      await expect(
        controller.updateStatusOption(makeReq(), VALID_UUID, { color: 'notacolor' })
      ).rejects.toThrow();
    });

    it('throws ZodError for unknown fields (strict schema)', async () => {
      await expect(
        controller.updateStatusOption(makeReq(), VALID_UUID, { unknown: 'x' })
      ).rejects.toThrow();
    });

    it('allows partial update with only sort_order', async () => {
      mockStatusOptionService.updateCustomStatusOption.mockResolvedValue(makeOption());

      await expect(
        controller.updateStatusOption(makeReq(), VALID_UUID, { sort_order: 5 })
      ).resolves.toBeDefined();

      expect(mockStatusOptionService.updateCustomStatusOption).toHaveBeenCalledWith(
        VALID_UUID,
        USER_ID,
        { sort_order: 5 }
      );
    });

    it('propagates NotFoundException from service', async () => {
      mockStatusOptionService.updateCustomStatusOption.mockRejectedValue(
        new NotFoundException('Status option not found')
      );

      await expect(
        controller.updateStatusOption(makeReq(), VALID_UUID, { label: 'X' })
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── DELETE /status-options/:id ────────────────────────────────────────────

  describe('deleteStatusOption', () => {
    it('calls service and returns success message', async () => {
      mockStatusOptionService.deleteCustomStatusOption.mockResolvedValue(undefined);

      const result = await controller.deleteStatusOption(makeReq(), VALID_UUID);

      expect(mockStatusOptionService.deleteCustomStatusOption).toHaveBeenCalledWith(
        VALID_UUID,
        USER_ID
      );
      expect(result).toEqual({ message: 'Status option deleted successfully' });
    });

    it('throws ZodError for invalid UUID param', async () => {
      await expect(
        controller.deleteStatusOption(makeReq(), 'not-a-uuid')
      ).rejects.toThrow();
    });

    it('propagates NotFoundException from service', async () => {
      mockStatusOptionService.deleteCustomStatusOption.mockRejectedValue(
        new NotFoundException('Status option not found')
      );

      await expect(
        controller.deleteStatusOption(makeReq(), VALID_UUID)
      ).rejects.toThrow(NotFoundException);
    });

    it('propagates BadRequestException for system option deletion', async () => {
      mockStatusOptionService.deleteCustomStatusOption.mockRejectedValue(
        new BadRequestException('Cannot delete system status option')
      );

      await expect(
        controller.deleteStatusOption(makeReq(), VALID_UUID)
      ).rejects.toThrow(BadRequestException);
    });
  });
});

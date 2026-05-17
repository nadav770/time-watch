'use strict';

process.env.JWT_SECRET = 'test-secret-used-only-in-jest-at-least-32-chars!!';

jest.mock('../utils/jwt');

import { verifyToken } from '../utils/jwt';
import { authenticate, requireRole } from '../middleware/auth';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';

const mockVerifyToken = verifyToken as jest.MockedFunction<typeof verifyToken>;

describe('authenticate middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('401 — calls next(UnauthorizedError) when token cookie is missing', () => {
    const req = { cookies: {} } as any;
    const next = jest.fn();

    authenticate(req, {} as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
  });

  it('401 — calls next(UnauthorizedError) when token is expired', () => {
    const { TokenExpiredError } = jest.requireActual('jsonwebtoken');
    mockVerifyToken.mockImplementation(() => {
      throw new TokenExpiredError('jwt expired', new Date());
    });
    const req = { cookies: { token: 'expired.jwt.token' } } as any;
    const next = jest.fn();

    authenticate(req, {} as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
  });

  it('401 — calls next(UnauthorizedError) when token signature is invalid', () => {
    const { JsonWebTokenError } = jest.requireActual('jsonwebtoken');
    mockVerifyToken.mockImplementation(() => {
      throw new JsonWebTokenError('invalid signature');
    });
    const req = { cookies: { token: 'bad.signature.token' } } as any;
    const next = jest.fn();

    authenticate(req, {} as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
  });

  it('500 — unexpected error from verifyToken is not swallowed as 401', () => {
    mockVerifyToken.mockImplementation(() => { throw new Error('unexpected internal error'); });
    const req = { cookies: { token: 'some.jwt.token' } } as any;
    const next = jest.fn();

    authenticate(req, {} as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).not.toBeInstanceOf(UnauthorizedError);
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it('valid token — attaches req.user from payload and calls next() with no arguments', () => {
    mockVerifyToken.mockReturnValue({ sub: 'user-uuid-123', role: 'employee' });
    const req = { cookies: { token: 'valid.jwt.token' } } as any;
    const next = jest.fn();

    authenticate(req, {} as any, next);

    expect(req.user).toEqual({ id: 'user-uuid-123', role: 'employee' });
    expect(next).toHaveBeenCalledWith();
  });

  it('valid Bearer token — accepted when no cookie is present', () => {
    mockVerifyToken.mockReturnValue({ sub: 'header-user-id', role: 'employee' });
    const req = { cookies: {}, headers: { authorization: 'Bearer header.jwt.token' } } as any;
    const next = jest.fn();

    authenticate(req, {} as any, next);

    expect(mockVerifyToken).toHaveBeenCalledWith('header.jwt.token');
    expect(req.user).toEqual({ id: 'header-user-id', role: 'employee' });
    expect(next).toHaveBeenCalledWith();
  });

  it('cookie token takes priority when both cookie and Bearer header are present', () => {
    mockVerifyToken.mockReturnValue({ sub: 'cookie-user-id', role: 'admin' });
    const req = {
      cookies: { token: 'cookie.jwt.token' },
      headers: { authorization: 'Bearer header.jwt.token' },
    } as any;
    const next = jest.fn();

    authenticate(req, {} as any, next);

    expect(mockVerifyToken).toHaveBeenCalledWith('cookie.jwt.token');
    expect(mockVerifyToken).not.toHaveBeenCalledWith('header.jwt.token');
    expect(req.user).toEqual({ id: 'cookie-user-id', role: 'admin' });
    expect(next).toHaveBeenCalledWith();
  });
});

describe('requireRole middleware', () => {
  it('401 — calls next(UnauthorizedError) when req.user is undefined', () => {
    const next = jest.fn();

    requireRole('admin')({ cookies: {} } as any, {} as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
  });

  it('403 — calls next(ForbiddenError) when role is not in the allowed list', () => {
    const next = jest.fn();

    requireRole('admin')({ user: { id: 'u1', role: 'employee' } } as any, {} as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(ForbiddenError);
  });

  it('allowed single role — calls next() with no arguments', () => {
    const next = jest.fn();

    requireRole('admin')({ user: { id: 'u1', role: 'admin' } } as any, {} as any, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('multiple allowed roles — first role passes', () => {
    const next = jest.fn();

    requireRole('admin', 'manager')({ user: { id: 'u1', role: 'admin' } } as any, {} as any, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('multiple allowed roles — second role passes', () => {
    const next = jest.fn();

    requireRole('admin', 'manager')({ user: { id: 'u1', role: 'manager' } } as any, {} as any, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('403 — req.body.role is ignored; only req.user.role is checked', () => {
    const next = jest.fn();

    requireRole('admin')({ user: { id: 'u1', role: 'employee' }, body: { role: 'admin' } } as any, {} as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(ForbiddenError);
  });

  it('403 — role undefined in token payload is treated as non-matching', () => {
    const next = jest.fn();

    requireRole('admin')({ user: { id: 'u1', role: undefined } } as any, {} as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(ForbiddenError);
  });

  it('403 — empty roles list blocks any authenticated user', () => {
    const next = jest.fn();

    requireRole()({ user: { id: 'u1', role: 'admin' } } as any, {} as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(ForbiddenError);
  });
});

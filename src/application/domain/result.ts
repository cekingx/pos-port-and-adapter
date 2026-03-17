export type Result<T, E> = Ok<T> | Fail<E>;

interface Ok<T> {
  ok: true;
  value: T;
}

interface Fail<E> {
  ok: false;
  error: E;
}

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const fail = <E>(error: E): Result<never, E> => ({ ok: false, error });

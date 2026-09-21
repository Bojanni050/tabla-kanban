import { Request, Response, NextFunction, RequestHandler } from 'express';

// Express 4 does not catch rejected promises from async handlers; forward them to the
// error middleware so a failed query returns a 500 instead of crashing the process.
export function wrap(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

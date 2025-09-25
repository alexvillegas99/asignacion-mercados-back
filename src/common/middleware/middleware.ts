import * as express from 'express';

export const cacheControlMiddleware = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  next();
};

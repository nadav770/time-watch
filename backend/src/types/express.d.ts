declare global {
  namespace Express {
    interface Request {
      user?: { id: number | string; role: string }
    }
  }
}
export {}

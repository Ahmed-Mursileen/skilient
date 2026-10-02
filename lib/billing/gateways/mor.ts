/** The USD merchant of record (Paddle). Logic shared with the billing-worker Edge Function. */
export { createPaddleAdapter, normalisePaddle, paddleConfig, PADDLE_SIGNATURE_HEADER, signPaddle } from "@/supabase/functions/_shared/billing/paddle.ts";

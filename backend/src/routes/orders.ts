import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth";
import { createOrder, listOrders, getOrder } from "../services/orderService";
import { generateInvoicePdf, sendInvoiceEmail } from "../services/invoiceService";
import prisma from "../config/db";
import { AppError } from "../middleware/errorHandler";

const router = Router();
router.use(authenticate);

const addressSchema = z.object({
  fullName: z.string().min(1, "Full name is required"),
  line1: z.string().min(1, "Address line 1 is required"),
  line2: z.string().optional().default(""),
  city: z.string().min(1, "City is required"),
  postalCode: z.string().regex(/^\d{5}$/, "Postal code must be exactly 5 digits"),
  country: z.string().min(1, "Country is required"),
});

// POST /api/orders — finalize cart into an order (Story 16)
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const address = addressSchema.parse(req.body.address);
    const order = await createOrder(req.user!.userId, address);

    // Story 17: generate invoice PDF and send email (non-blocking for order success)
    let emailPreviewUrl: string | undefined;
    try {
      const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
      if (user && order.invoiceNo) {
        const invoiceData = {
          invoiceNo: order.invoiceNo,
          date: order.createdAt,
          customerName: user.name,
          customerEmail: user.email,
          address,
          items: order.items.map((i: any) => ({
            productName: i.productName,
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: Number(i.unitPrice),
            lineTotal: Number(i.lineTotal),
          })),
          totalAmount: Number(order.totalAmount),
        };

        const pdfBuffer = await generateInvoicePdf(invoiceData);
        const emailResult = await sendInvoiceEmail(invoiceData, pdfBuffer);
        emailPreviewUrl = emailResult.previewUrl;
      }
    } catch (emailErr) {
      console.error("[Order] Invoice/email generation failed (order still created):", emailErr);
    }

    res.status(201).json({
      order: {
        id: order.id,
        totalAmount: Number(order.totalAmount),
        status: order.status,
        invoiceNo: order.invoiceNo,
        createdAt: order.createdAt,
        itemCount: order.items.length,
      },
      emailPreviewUrl,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/orders — list user's orders (Story 16)
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orders = await listOrders(req.user!.userId);
    res.json(orders);
  } catch (err) {
    next(err);
  }
});

// GET /api/orders/revenue?from=YYYY-MM-DD&to=YYYY-MM-DD — Story 32
// Daily revenue totals across all orders in the inclusive date range.
// sales_manager only. Missing days in the range are filled with revenue=0
// so the resulting series is continuous and chart-friendly.
router.get("/revenue", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== "sales_manager") {
      throw new AppError(403, "Only sales managers can view revenue data");
    }

    // Default range: last 30 days (inclusive) when no params given.
    const now = new Date();
    const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const defaultFrom = new Date(todayUtc);
    defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 29);

    const parseDate = (raw: unknown, fallback: Date): Date => {
      if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return fallback;
      const [y, m, d] = raw.split("-").map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d));
      return isNaN(dt.getTime()) ? fallback : dt;
    };

    const from = parseDate(req.query.from, defaultFrom);
    const to = parseDate(req.query.to, todayUtc);
    if (from > to) {
      throw new AppError(400, "'from' must not be after 'to'");
    }
    const toEnd = new Date(to);
    toEnd.setUTCHours(23, 59, 59, 999);

    type DailyRow = { day: Date; total: number };
    const rows = await prisma.$queryRaw<DailyRow[]>`
      SELECT date_trunc('day', "created_at")::date AS day,
             COALESCE(SUM("total_amount"), 0)::float AS total
      FROM "orders"
      WHERE "created_at" >= ${from} AND "created_at" <= ${toEnd}
      GROUP BY day
      ORDER BY day ASC
    `;

    // Fill missing days with zero revenue so the line chart is continuous.
    const byDay = new Map<string, number>();
    for (const r of rows) {
      const key = new Date(r.day).toISOString().slice(0, 10);
      byDay.set(key, Number(r.total) || 0);
    }
    const series: { date: string; revenue: number }[] = [];
    const cursor = new Date(from);
    while (cursor <= to) {
      const key = cursor.toISOString().slice(0, 10);
      series.push({ date: key, revenue: byDay.get(key) ?? 0 });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    res.json({
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      total: series.reduce((acc, p) => acc + p.revenue, 0),
      series,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/orders/:id — order detail (Story 16)
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orderId = parseInt(req.params.id as string, 10);
    if (isNaN(orderId)) { res.status(400).json({ error: "Invalid order ID" }); return; }
    const order = await getOrder(req.user!.userId, orderId);
    res.json(order);
  } catch (err) {
    next(err);
  }
});

// GET /api/orders/:id/invoice — download invoice PDF (Story 17)
router.get("/:id/invoice", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orderId = parseInt(req.params.id as string, 10);
    const order = await getOrder(req.user!.userId, orderId);

    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user) throw new AppError(404, "User not found");

    const pdfBuffer = await generateInvoicePdf({
      invoiceNo: order.invoiceNo || `ORD-${order.id}`,
      date: new Date(order.createdAt),
      customerName: user.name,
      customerEmail: user.email,
      address: order.address as any,
      items: order.items,
      totalAmount: order.totalAmount,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${order.invoiceNo || "invoice"}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
});

export default router;

import type { ActionFunctionArgs } from "react-router";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const body = (await request.json()) as {
    shop_id?: string;
    order_id?: string;
    customer_id?: string;
    tracking_token?: string;
    order_total?: number;
  };

  const shop = body.shop_id?.trim();
  const orderId = body.order_id?.trim();

  if (!shop || !orderId) {
    return new Response("Missing required fields", { status: 400 });
  }

  const shopRecord = await db.shop.findUnique({ where: { shop } });
  const commissionRate = shopRecord?.commissionRate ?? 0.02;
  const orderTotal =
    body.order_total !== undefined && body.order_total !== null
      ? Number(body.order_total)
      : null;
  const commissionAmount =
    orderTotal !== null ? Number(orderTotal) * Number(commissionRate) : null;

  await db.conversion.create({
    data: {
      shop,
      orderId,
      customerId: body.customer_id || null,
      trackingToken: body.tracking_token || null,
      orderTotal: orderTotal,
      commissionRate,
      commissionAmount: commissionAmount,
    },
  });

  return new Response(JSON.stringify({ status: "ok" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

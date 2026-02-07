import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

type OrderPayload = {
  id?: number;
  total_price?: string;
  currency?: string;
  customer?: { id?: number };
  note_attributes?: Array<{ name?: string; value?: string }>;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const order = payload as OrderPayload;
  const orderId = order.id ? String(order.id) : null;
  if (!orderId) {
    return new Response();
  }

  const trackingToken =
    order.note_attributes?.find(
      (attr) => attr.name === "pf_tracking_token",
    )?.value || null;

  if (!trackingToken) {
    return new Response();
  }

  const shopRecord = await db.shop.findUnique({ where: { shop } });
  const commissionRate = shopRecord?.commissionRate ?? 0.02;
  const orderTotal = order.total_price ? Number(order.total_price) : null;
  const commissionAmount =
    orderTotal !== null ? orderTotal * Number(commissionRate) : null;

  await db.conversion.upsert({
    where: { orderId },
    update: {
      trackingToken,
      orderTotal,
      commissionAmount,
      commissionRate,
    },
    create: {
      shop,
      orderId,
      customerId: order.customer?.id
        ? String(order.customer.id)
        : null,
      trackingToken,
      orderTotal,
      commissionRate,
      commissionAmount,
    },
  });

  await db.shop.upsert({
    where: { shop },
    update: { lastActiveAt: new Date() },
    create: {
      shop,
      shopDomain: shop,
      lastActiveAt: new Date(),
    },
  });

  return new Response();
};

import { NextRequest, NextResponse } from "next/server";

interface EncryptedOrderRecord {
  encryptedData: string;
  orderHash: string;
  owner: string;
  createdAt: number;
  version: number;
}

const encryptedOrderStore = new Map<string, EncryptedOrderRecord>();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ hash: string }> }
) {
  try {
    const { hash } = await params;

    if (!hash || typeof hash !== "string" || hash.length !== 64) {
      return NextResponse.json(
        { error: "Invalid order hash format" },
        { status: 400 }
      );
    }

    const record = encryptedOrderStore.get(hash);

    if (!record) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      encryptedData: record.encryptedData,
      orderHash: record.orderHash,
      owner: record.owner,
      version: record.version,
    });
  } catch (error) {
    console.error("Failed to fetch encrypted order:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ hash: string }> }
) {
  try {
    const { hash } = await params;
    const body = await request.json();

    if (!hash || typeof hash !== "string" || hash.length !== 64) {
      return NextResponse.json(
        { error: "Invalid order hash format" },
        { status: 400 }
      );
    }

    const { encryptedData, owner, version } = body;

    if (!encryptedData || !owner) {
      return NextResponse.json(
        { error: "Missing required fields: encryptedData, owner" },
        { status: 400 }
      );
    }

    if (encryptedOrderStore.has(hash)) {
      return NextResponse.json(
        { error: "Order hash already exists" },
        { status: 409 }
      );
    }

    const record: EncryptedOrderRecord = {
      encryptedData,
      orderHash: hash,
      owner,
      createdAt: Date.now(),
      version: version || 1,
    };

    encryptedOrderStore.set(hash, record);

    return NextResponse.json({
      success: true,
      orderHash: hash,
    });
  } catch (error) {
    console.error("Failed to store encrypted order:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ hash: string }> }
) {
  try {
    const { hash } = await params;

    if (!hash || typeof hash !== "string" || hash.length !== 64) {
      return NextResponse.json(
        { error: "Invalid order hash format" },
        { status: 400 }
      );
    }

    const deleted = encryptedOrderStore.delete(hash);

    if (!deleted) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      orderHash: hash,
    });
  } catch (error) {
    console.error("Failed to delete encrypted order:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

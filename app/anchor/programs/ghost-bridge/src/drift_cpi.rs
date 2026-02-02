use crate::state::OrderSide;

/// 8-byte Anchor discriminator for Drift's place_perp_order instruction.
/// Computed as: sha256("global:place_perp_order")[0..8]
/// Verified: echo -n "global:place_perp_order" | sha256sum -> 45a15dca787e4cb9...
pub const PLACE_PERP_ORDER_DISCRIMINATOR: [u8; 8] = [0x45, 0xa1, 0x5d, 0xca, 0x78, 0x7e, 0x4c, 0xb9];

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum DriftOrderType {
    Market = 0,
    Limit = 1,
    TriggerMarket = 2,
    TriggerLimit = 3,
    Oracle = 4,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum DriftMarketType {
    Spot = 0,
    Perp = 1,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum DriftPostOnlyParam {
    None = 0,
    MustPostOnly = 1,
    TryPostOnly = 2,
    Slide = 3,
}

/// Build instruction data for Drift's place_perp_order.
///
/// This constructs a properly formatted instruction according to the Drift IDL v2.150.0.
/// The OrderParams struct uses Borsh serialization with Option types encoded as:
/// - None: 1 byte (0x00)
/// - Some(value): 1 byte (0x01) + value bytes
///
/// # Layout
/// ```text
/// [0-7]    discriminator (8 bytes)
/// [8]      orderType (1 byte enum)
/// [9]      marketType (1 byte enum, always Perp=1)
/// [10]     direction (1 byte enum: Long=0, Short=1)
/// [11]     userOrderId (1 byte, 0 for auto-assign)
/// [12-19]  baseAssetAmount (8 bytes u64 LE)
/// [20-27]  price (8 bytes u64 LE)
/// [28-29]  marketIndex (2 bytes u16 LE)
/// [30]     reduceOnly (1 byte bool)
/// [31]     postOnly (1 byte enum)
/// [32]     bitFlags (1 byte u8 bitmask)
/// [33]     maxTs (Option<i64>: 1 byte None)
/// [34]     triggerPrice (Option<u64>: 1 byte None)
/// [35]     triggerCondition (1 byte enum, ignored when triggerPrice=None)
/// [36]     oraclePriceOffset (Option<i32>: 1 byte None)
/// [37]     auctionDuration (Option<u8>: 1 byte None)
/// [38]     auctionStartPrice (Option<i64>: 1 byte None)
/// [39]     auctionEndPrice (Option<i64>: 1 byte None)
/// ```
pub fn build_drift_place_perp_order(
    market_index: u16,
    side: OrderSide,
    base_asset_amount: u64,
    reduce_only: bool,
) -> Vec<u8> {
    build_drift_place_perp_order_full(
        DriftOrderType::Market,
        market_index,
        side,
        base_asset_amount,
        0, // price (0 for market orders)
        reduce_only,
        0, // bitFlags
    )
}

/// Build a market order instruction with more options.
pub fn build_drift_place_perp_order_full(
    order_type: DriftOrderType,
    market_index: u16,
    side: OrderSide,
    base_asset_amount: u64,
    price: u64,
    reduce_only: bool,
    bit_flags: u8,
) -> Vec<u8> {
    let mut data = Vec::with_capacity(40);

    // 8-byte discriminator
    data.extend_from_slice(&PLACE_PERP_ORDER_DISCRIMINATOR);

    // OrderParams struct (Borsh serialized)
    data.push(order_type as u8);
    data.push(DriftMarketType::Perp as u8);

    // direction
    data.push(match side {
        OrderSide::Long => 0,
        OrderSide::Short => 1,
    });

    // userOrderId (0 = auto-assign)
    data.push(0u8);

    // baseAssetAmount (u64 LE)
    data.extend_from_slice(&base_asset_amount.to_le_bytes());

    // price (u64 LE)
    data.extend_from_slice(&price.to_le_bytes());

    // marketIndex (u16 LE)
    data.extend_from_slice(&market_index.to_le_bytes());

    // reduceOnly (bool)
    data.push(if reduce_only { 1 } else { 0 });

    // postOnly (enum)
    data.push(DriftPostOnlyParam::None as u8);

    // bitFlags (u8 bitmask)
    data.push(bit_flags);

    // Option fields - all None for basic market orders
    // Each None is encoded as a single 0x00 byte (Borsh Option discriminant)
    data.push(0u8); // maxTs: None
    data.push(0u8); // triggerPrice: None
    data.push(0u8); // triggerCondition: Above=0 (ignored when triggerPrice=None)
    data.push(0u8); // oraclePriceOffset: None
    data.push(0u8); // auctionDuration: None
    data.push(0u8); // auctionStartPrice: None
    data.push(0u8); // auctionEndPrice: None

    data
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_discriminator_is_correct() {
        // This test verifies the discriminator matches sha256("global:place_perp_order")[0..8]
        // Expected: 0x45, 0xa1, 0x5d, 0xca, 0x78, 0x7e, 0x4c, 0xb9
        assert_eq!(PLACE_PERP_ORDER_DISCRIMINATOR[0], 0x45);
        assert_eq!(PLACE_PERP_ORDER_DISCRIMINATOR[1], 0xa1);
        assert_eq!(PLACE_PERP_ORDER_DISCRIMINATOR[2], 0x5d);
        assert_eq!(PLACE_PERP_ORDER_DISCRIMINATOR[3], 0xca);
        assert_eq!(PLACE_PERP_ORDER_DISCRIMINATOR[4], 0x78);
        assert_eq!(PLACE_PERP_ORDER_DISCRIMINATOR[5], 0x7e);
        assert_eq!(PLACE_PERP_ORDER_DISCRIMINATOR[6], 0x4c);
        assert_eq!(PLACE_PERP_ORDER_DISCRIMINATOR[7], 0xb9);
    }

    #[test]
    fn test_build_market_order() {
        let data = build_drift_place_perp_order(0, OrderSide::Long, 1_000_000_000, false);

        // Check discriminator (8 bytes)
        assert_eq!(&data[0..8], &PLACE_PERP_ORDER_DISCRIMINATOR);

        // Check orderType = Market (0)
        assert_eq!(data[8], 0);

        // Check marketType = Perp (1)
        assert_eq!(data[9], 1);

        // Check direction = Long (0)
        assert_eq!(data[10], 0);

        // Check userOrderId = 0
        assert_eq!(data[11], 0);

        // Check baseAssetAmount (1_000_000_000 in LE)
        let amount = u64::from_le_bytes(data[12..20].try_into().unwrap());
        assert_eq!(amount, 1_000_000_000);

        // Check price = 0 (market order)
        let price = u64::from_le_bytes(data[20..28].try_into().unwrap());
        assert_eq!(price, 0);

        // Check marketIndex = 0
        let market_idx = u16::from_le_bytes(data[28..30].try_into().unwrap());
        assert_eq!(market_idx, 0);

        // Check reduceOnly = false
        assert_eq!(data[30], 0);

        // Check postOnly = None (0)
        assert_eq!(data[31], 0);

        // Check bitFlags = 0
        assert_eq!(data[32], 0);

        // Check Option fields are all None (0)
        for i in 33..40 {
            assert_eq!(data[i], 0, "Option field at index {} should be None", i);
        }

        // Total length should be 40 bytes
        assert_eq!(data.len(), 40);
    }

    #[test]
    fn test_build_short_order() {
        let data = build_drift_place_perp_order(1, OrderSide::Short, 500_000_000, true);

        // Check direction = Short (1)
        assert_eq!(data[10], 1);

        // Check marketIndex = 1
        let market_idx = u16::from_le_bytes(data[28..30].try_into().unwrap());
        assert_eq!(market_idx, 1);

        // Check reduceOnly = true
        assert_eq!(data[30], 1);
    }
}

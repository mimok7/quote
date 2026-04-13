import supabase from './supabase';

interface SetBasePriceResult {
    success: boolean;
    basePrice?: number;
    usageDate?: string;
    error?: string;
}

/**
 * 서비스 항목(room, car)의 베이스 가격을 조회하고 quote_item에 동기화
 */
export async function setBasePriceAndSyncQuoteItem(
    serviceType: 'room' | 'car',
    itemId: string,
    code: string,
    quoteId: string,
    quantity: number
): Promise<SetBasePriceResult> {
    try {
        let basePrice = 0;
        let usageDate: string | undefined;

        if (serviceType === 'room') {
            // room_price 또는 cruise_rate_card에서 가격 조회
            const { data: room } = await supabase
                .from('room')
                .select('checkin_date')
                .eq('id', itemId)
                .maybeSingle();

            usageDate = room?.checkin_date;

            const { data: priceData } = await supabase
                .from('cruise_rate_card')
                .select('price_adult')
                .eq('id', code)
                .maybeSingle();

            if (priceData) {
                basePrice = Number(priceData.price_adult) || 0;
            }

            // room 테이블에 base_price 업데이트
            await supabase
                .from('room')
                .update({ room_code: code, base_price: basePrice })
                .eq('id', itemId);

        } else if (serviceType === 'car') {
            // car_price에서 가격 조회
            const { data: priceData } = await supabase
                .from('car_price')
                .select('price')
                .eq('code', code)
                .maybeSingle();

            if (priceData) {
                basePrice = Number(priceData.price) || 0;
            }

            // car 테이블에 base_price 업데이트
            await supabase
                .from('car')
                .update({ car_code: code, base_price: basePrice })
                .eq('id', itemId);
        }

        // quote_item에 동기화
        const { data: existingItem } = await supabase
            .from('quote_item')
            .select('id')
            .eq('quote_id', quoteId)
            .eq('service_type', serviceType)
            .eq('service_id', itemId)
            .maybeSingle();

        if (existingItem) {
            await supabase
                .from('quote_item')
                .update({
                    base_price: basePrice,
                    quantity: quantity,
                    total_price: basePrice * quantity,
                    usage_date: usageDate,
                })
                .eq('id', existingItem.id);
        } else {
            await supabase
                .from('quote_item')
                .insert({
                    quote_id: quoteId,
                    service_type: serviceType,
                    service_id: itemId,
                    base_price: basePrice,
                    quantity: quantity,
                    total_price: basePrice * quantity,
                    usage_date: usageDate,
                });
        }

        return { success: true, basePrice, usageDate };
    } catch (error: any) {
        console.error('setBasePriceAndSyncQuoteItem 오류:', error);
        return { success: false, error: error.message };
    }
}

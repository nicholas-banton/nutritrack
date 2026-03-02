import { NextRequest, NextResponse } from 'next/server';

const USDA_API_KEY = 'mvzZnLlCpaptuPsNQyxKPX1NOAFuaNWoLQqEIf9V';
const USDA_BASE = 'https://api.nal.usda.gov/fdc/v1';

function getNutrient(nutrients: any[], nutrientId: number): number {
  const n = nutrients?.find((n: any) => n.nutrientId === nutrientId || n.nutrientNumber === String(nutrientId));
  return Math.round((n?.value || 0) * 10) / 10;
}

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q');
  if (!query) return NextResponse.json({ error: 'No query provided' }, { status: 400 });

  try {
    const res = await fetch(
      `${USDA_BASE}/foods/search?query=${encodeURIComponent(query)}&dataType=SR%20Legacy,Survey%20(FNDDS),Foundation&pageSize=20&api_key=${USDA_API_KEY}`
    );

    if (!res.ok) throw new Error('USDA API error');
    const data = await res.json();

    const foods = (data.foods || []).map((food: any) => ({
      fdcId: food.fdcId,
      foodName: food.description,
      brandOwner: food.brandOwner || null,
      category: food.foodCategory || food.brandedFoodCategory || 'General',
      portionSizeGrams: 100,
      calories: getNutrient(food.foodNutrients, 1008),
      proteinGrams: getNutrient(food.foodNutrients, 1003),
      carbsGrams: getNutrient(food.foodNutrients, 1005),
      fatGrams: getNutrient(food.foodNutrients, 1004),
    })).filter((f: any) => f.calories > 0);

    return NextResponse.json({ foods });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

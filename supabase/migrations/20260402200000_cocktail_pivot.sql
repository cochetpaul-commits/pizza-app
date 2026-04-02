-- Add pivot ingredient support for cocktails (production mode)
ALTER TABLE cocktails ADD COLUMN IF NOT EXISTS pivot_ingredient_id UUID REFERENCES ingredients(id);

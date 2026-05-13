-- Insert "For Drivers" category into kb_categories if it does not exist
INSERT INTO public.kb_categories (name, description, sort_order)
SELECT 'For Drivers', 'Bus app tutorials and guides', 5
WHERE NOT EXISTS (
    SELECT 1 FROM public.kb_categories WHERE name = 'For Drivers'
);

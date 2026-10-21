CREATE OR REPLACE FUNCTION public.set_alert_bbox()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.geometry IS NOT DISTINCT FROM OLD.geometry THEN
    RETURN NEW;
  END IF;
  NEW.bbox_min_lon := NULL; NEW.bbox_max_lon := NULL; NEW.bbox_min_lat := NULL; NEW.bbox_max_lat := NULL;
  IF NEW.geometry IS NULL THEN RETURN NEW; END IF;
  SELECT min((p->>0)::float8), max((p->>0)::float8), min((p->>1)::float8), max((p->>1)::float8)
    INTO NEW.bbox_min_lon, NEW.bbox_max_lon, NEW.bbox_min_lat, NEW.bbox_max_lat
  FROM jsonb_path_query(NEW.geometry, 'lax $.** ? (@.type() == "array" && @[0].type() == "number" && @[1].type() == "number")') p;
  RETURN NEW;
END; $$;
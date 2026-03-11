"""Test rapide du scoring engine."""
from scoring.engine import score_all_restaurants
from data.mock_data import MOCK_RESTAURANTS
from data.mock_tourist_sites import TOURIST_SITES

results = score_all_restaurants(MOCK_RESTAURANTS, 48.8566, 2.3522, TOURIST_SITES)

for r in results:
    s = r["scoring"]
    print(
        f"{r['name']:30s} Score: {s['score_final']:6.2f}  "
        f"(GeoT: {s['score_geo_tourist']:.2f}  "
        f"GeoU: {s['score_geo_user']:.2f}  "
        f"Lang: {s['score_language']})"
    )

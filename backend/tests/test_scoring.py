"""
Tests du moteur de scoring.

Vérifie les invariants issus des décisions D-001 à D-012.
Ce ne sont pas des tests de valeurs exactes — les pondérations sont provisoires
et changeront à la calibration (D-006). Ce sont des tests de PROPRIÉTÉS : les
comportements qui doivent rester vrais quelles que soient les pondérations.

Lancement :  python -m backend.tests.test_scoring
"""

from backend import config
from backend.core.scoring.engine import compute_local_signal, rank_restaurants
from backend.core.scoring.geo_score import score_tourist_zone
from backend.core.scoring.language_score import score_language
from backend.core.scoring.menu_score import score_languages, score_menu
from backend.data.mock_data import MOCK_RESTAURANTS
from backend.data.mock_tourist_sites import TOURIST_SITES

_failures = []


def check(condition, label, detail=""):
    if condition:
        print(f"  OK    {label}")
    else:
        print(f"  ECHEC {label}  {detail}")
        _failures.append(label)


# =============================================================================
print("\n[D-001] Un restaurant sans avis ne doit pas etre penalise")
# =============================================================================

sans_avis = {"lat": 48.8600, "lng": 2.4400, "reviews": [], "price": 20, "type": "Française"}
avec_avis_etrangers = {
    "lat": 48.8600, "lng": 2.4400, "price": 20, "type": "Française",
    "reviews": [{"text": "Great spot", "lang": "en"} for _ in range(20)],
}

s_vide = compute_local_signal(sans_avis, TOURIST_SITES)
s_etranger = compute_local_signal(avec_avis_etrangers, TOURIST_SITES)

check(
    s_vide["local_signal"] > s_etranger["local_signal"],
    "sans avis > avis 100% etrangers",
    f"({s_vide['local_signal']} vs {s_etranger['local_signal']})",
)
check(
    s_vide["confidence"] < s_etranger["confidence"],
    "l'absence d'avis reduit la CONFIANCE, pas le score",
    f"(conf {s_vide['confidence']} vs {s_etranger['confidence']})",
)


# =============================================================================
print("\n[D-002] La proximite d'un site touristique est une PENALITE")
# =============================================================================

site = TOURIST_SITES[0]
au_pied = score_tourist_zone(site["lat"], site["lng"], TOURIST_SITES)
loin = score_tourist_zone(48.9500, 2.6000, TOURIST_SITES)

check(au_pied < loin, "au pied du monument < loin du monument", f"({au_pied} vs {loin})")
check(loin == 1.0, "hors zone = neutre (1.0), pas de bonus a s'eloigner", f"({loin})")


# =============================================================================
print("\n[D-003] Score de langue continu et lisse")
# =============================================================================

deux_avis = [{"text": "x", "lang": "fr"}] * 2
quarante = [{"text": "x", "lang": "fr"}] * 40 + [{"text": "x", "lang": "en"}] * 5

s2 = score_language(deux_avis, "fr")
s40 = score_language(quarante, "fr")
s0 = score_language([], "fr")

check(s2 < s40, "2 avis sur 2 vaut moins que 40 sur 45", f"({s2:.2f} vs {s40:.2f})")
check(0.0 < s2 < 1.0, "score continu, jamais binaire", f"({s2:.2f})")
check(abs(s0 - config.LANGUAGE_PRIOR) < 1e-9, "aucun avis = a priori neutre", f"({s0})")


# =============================================================================
print("\n[D-004] Signal menu : la carte discrimine")
# =============================================================================

local = score_menu({
    "cuisines": ["indonésienne"], "dish_count": 11,
    "languages": ["fr", "id"], "vernacular_ratio": 0.85, "has_tourist_menu": False,
})
piege = score_menu({
    "cuisines": ["française", "italienne", "américaine"], "dish_count": 55,
    "languages": ["fr", "en", "es", "de"], "vernacular_ratio": 0.1,
    "has_tourist_menu": True,
})

check(local["score"] > piege["score"], "carte locale > carte attrape-touristes",
      f"({local['score']} vs {piege['score']})")
check(score_menu(None)["score"] is None, "carte absente = None, pas 0.0")


# =============================================================================
print("\n[D-007] Les etoiles ne participent plus au classement")
# =============================================================================

base = {"lat": 48.8600, "lng": 2.4400, "reviews": [], "price": 20, "type": "Française"}
faible = compute_local_signal({**base, "rating": 2.0}, TOURIST_SITES)
forte = compute_local_signal({**base, "rating": 5.0}, TOURIST_SITES)

check(
    faible["local_signal"] == forte["local_signal"],
    "la note n'influence pas le Local Signal",
    f"({faible['local_signal']} vs {forte['local_signal']})",
)


# =============================================================================
print("\n[D-012] Redistribution des poids sur signal absent")
# =============================================================================

avec_carte = compute_local_signal(
    {**base, "menu": {"cuisines": ["française"], "dish_count": 12,
                      "languages": ["fr"], "vernacular_ratio": 0.5}},
    TOURIST_SITES,
)
sans_carte = compute_local_signal(base, TOURIST_SITES)

check(0 <= sans_carte["local_signal"] <= 100, "score sans carte reste dans [0,100]",
      f"({sans_carte['local_signal']})")
check(
    sans_carte["confidence"] < avec_carte["confidence"],
    "carte absente = confiance moindre",
    f"({sans_carte['confidence']} vs {avec_carte['confidence']})",
)


# =============================================================================
print("\n[D-008] Separation statique / dynamique")
# =============================================================================

r = dict(MOCK_RESTAURANTS[0])
proche = compute_local_signal(r, TOURIST_SITES, peers=MOCK_RESTAURANTS)
check(
    "menu" in proche["signals"] and "price" in proche["signals"],
    "le Local Signal agrege bien menu + langue + prix + zone",
)
check(
    all(k not in proche for k in ("proximity", "distance_m")),
    "le Local Signal ne contient aucune donnee dependant de l'utilisateur",
)


# =============================================================================
print("\n[D-024] Langue de la carte : vehiculaire vs vernaculaire")
# =============================================================================

fr_seul = score_languages(["fr"])
en_seul = score_languages(["en"])
zh_seul = score_languages(["zh"])
fr_en = score_languages(["fr", "en"])
en_zh = score_languages(["en", "zh"])

check(
    en_seul < fr_seul,
    "une carte en anglais seul est penalisee face au francais seul",
    f"({en_seul} vs {fr_seul})",
)
check(
    zh_seul == fr_seul,
    "une carte en langue de diaspora n'est PAS penalisee (D-001)",
    f"(zh={zh_seul}, fr={fr_seul})",
)
check(
    en_zh < zh_seul,
    "ajouter l'anglais a une carte de diaspora la penalise",
    f"({en_zh} vs {zh_seul})",
)
check(
    fr_en > en_seul,
    "garder le francais attenue la penalite de l'anglais",
    f"({fr_en} vs {en_seul})",
)
check(
    score_languages(["FR"]) == score_languages(["fr"]) == score_languages(["fra"]),
    "la casse et les codes a 3 lettres sont normalises",
)
check(
    score_languages([]) is None,
    "aucune langue relevee = signal indisponible, pas 0.0 (D-012)",
)


# =============================================================================
print("\n--- Classement sur les donnees mockees (utilisateur a Montreuil) ---")
# =============================================================================

results = rank_restaurants(MOCK_RESTAURANTS, 48.8620, 2.4430, TOURIST_SITES)

print(f"\n{'Restaurant':<24}{'Final':>7}{'Local':>7}{'Conf':>7}  Signaux")
print("-" * 78)
for r in results:
    s = r["scoring"]
    sig = s["signals"]
    menu_v = sig["menu"]["value"]
    menu_str = f"{menu_v:.2f}" if menu_v is not None else " -- "
    print(
        f"{r['name']:<24}{s['score_final']:>7.1f}{s['local_signal']:>7.1f}"
        f"{s['confidence']:>7.2f}  "
        f"menu {menu_str}  lang {sig['language']['value']:.2f}  "
        f"zone {sig['tourist_zone']['value']:.2f}"
    )

print(f"\nExemple d'explication — {results[0]['name']} :")
for reason in results[0]["scoring"]["reasons"]:
    print(f"  - {reason}")


# =============================================================================
print("\n" + "=" * 78)
if _failures:
    print(f"{len(_failures)} ECHEC(S) : {', '.join(_failures)}")
    raise SystemExit(1)
print("Tous les invariants sont verifies.")

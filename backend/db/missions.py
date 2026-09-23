# backend/db/missions.py
#
# LE FICHIER QU'UN ANNOTATEUR REÇOIT (D-043, D-044).
#
# POURQUOI CE MODULE EXISTE. Un annotateur ne reçoit ni la base, ni un accès au
# web : il reçoit UN fichier, figé, contenant exactement ce sur quoi il doit
# juger. C'est ce qui rend l'annotation rejouable — un jury peut relire le
# fichier soumis et refaire le raisonnement. Générer ce fichier à la main ne
# tiendrait pas à l'échelle : 15 blocs × 4 annotateurs font 60 fichiers.
#
# CE QU'IL Y A DEDANS, ET DANS CET ORDRE :
#
#   1. les dossiers des restaurants du bloc — base seule, ou enrichis de la
#      recherche web des documentalistes selon `--web` ;
#   2. les duels à juger, dans l'ordre gauche/droite propre à CET annotateur.
#
# POURQUOI UN BLOC ET PAS TOUT L'ÉCHANTILLON. 467 dossiers dépassent ce qu'un
# annotateur peut tenir en tête, humain comme modèle. Les blocs de `paires.py`
# se chevauchent, et les restaurants partagés servent d'ancres pour recoller les
# échelles — voir la docstring de `blocs()`.
#
# Usage, depuis la racine du dépôt :
#
#     python -m backend.db.missions --plan paires-467.json --web
#     python -m backend.db.missions --plan paires-467.json --web --bloc 3

import argparse
import json
from pathlib import Path

from backend.db.dossier_annotation import en_texte

DOSSIER = Path("docs/data/annotation-pilote")


def bloc_web(fiche: dict | None) -> str:
    """
    La partie « ce qu'une recherche web a trouvé », mise en forme.

    Une rubrique vide s'écrit « aucune mention trouvée » plutôt que de
    disparaître : l'absence de couverture est une information, et l'annotateur
    doit voir qu'on a cherché sans rien trouver — pas qu'on n'a pas cherché.
    """
    if not fiche:
        return "  (aucune recherche web n'a été menée sur cet établissement)"
    lignes = []
    for cle, libelle in (
        ("presse_francophone", "Presse food francophone (s'adresse à des Parisiens)"),
        ("guides_visiteurs", "Guides et sélections pour visiteurs"),
        ("reseaux_sociaux", "Réseaux sociaux et créateurs"),
    ):
        valeurs = fiche.get(cle) or []
        if isinstance(valeurs, str):
            valeurs = [valeurs]
        lignes.append(f"  {libelle} :")
        lignes += [f"    - {v}" for v in valeurs] or ["    - aucune mention trouvée"]
    if fiche.get("site_officiel"):
        lignes.append(f"  Site officiel : {fiche['site_officiel']}")
    faits = fiche.get("autres_faits") or []
    if faits:
        lignes.append("  Autres faits :")
        lignes += [f"    - {f}" for f in faits]
    doute = str(fiche.get("incertitudes") or "").strip()
    if doute and "aucune" not in doute.lower():
        lignes.append(f"  ATTENTION — incertitude signalée par le documentaliste : {doute}")
    return "\n".join(lignes)


def ecrire(plan_nom: str, avec_web: bool, sortie: Path,
           bloc_choisi: int | None = None) -> list[Path]:
    plan = json.loads((DOSSIER / plan_nom).read_text(encoding="utf-8"))
    dossiers = json.loads(
        (DOSSIER / "dossiers-quartier-latin.json").read_text(encoding="utf-8"))
    web = {}
    if avec_web:
        chemin = DOSSIER / "web-quartier-latin.json"
        if chemin.exists():
            web = json.loads(chemin.read_text(encoding="utf-8"))

    sortie.mkdir(parents=True, exist_ok=True)
    ecrits = []
    for annotateur, duels in plan["par_annotateur"].items():
        par_bloc: dict[int, list] = {}
        for d in duels:
            par_bloc.setdefault(d.get("bloc", 1), []).append(d)

        for numero, liste in sorted(par_bloc.items()):
            if bloc_choisi and numero != bloc_choisi:
                continue
            # Les dossiers dont ce bloc a besoin, et eux seuls.
            ids = list(dict.fromkeys(
                [d["gauche"] for d in liste] + [d["droite"] for d in liste]))
            corpus = "\n\n".join(
                en_texte(dossiers[i])
                + ("\n\nCE QU'UNE RECHERCHE WEB A TROUVÉ :\n" + bloc_web(web.get(i))
                   if avec_web else "")
                for i in ids if i in dossiers)
            texte = (
                f"# Corpus — {len(ids)} dossiers"
                f"{' (base + recherche web)' if avec_web else ''}\n\n{corpus}\n\n"
                f"# Les {len(liste)} duels à juger\n\n"
                + "\n".join(f"{d['paire']} ; A = {d['nom_gauche']} ; B = {d['nom_droite']}"
                            for d in liste) + "\n")
            chemin = sortie / f"mission_b{numero:02d}_{annotateur}.md"
            chemin.write_text(texte, encoding="utf-8")
            ecrits.append(chemin)
    return ecrits


def main() -> None:
    ap = argparse.ArgumentParser(description="Fichiers de mission (D-043, D-044).")
    ap.add_argument("--plan", default="paires-467.json")
    ap.add_argument("--web", action="store_true",
                    help="enrichir les dossiers de la recherche web collectée")
    ap.add_argument("--bloc", type=int, default=None,
                    help="ne générer qu'un bloc, pour lancer par vagues")
    ap.add_argument("--sortie", default=None,
                    help="dossier de sortie (défaut : le scratchpad de la session)")
    args = ap.parse_args()

    sortie = Path(args.sortie) if args.sortie else Path("missions")
    ecrits = ecrire(args.plan, args.web, sortie, args.bloc)
    total = sum(c.stat().st_size for c in ecrits)
    print(f"[Missions] {len(ecrits)} fichiers dans {sortie}")
    if ecrits:
        print(f"   taille moyenne {total // len(ecrits) // 1024} Ko · "
              f"total {total // 1024 // 1024} Mo")
        print(f"   exemple : {ecrits[0].name}")


if __name__ == "__main__":
    main()

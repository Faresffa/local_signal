# app.py — Local Signal V0.1
# Frontend Streamlit connecté au moteur de scoring, filtres, et BDD

import streamlit as st
import pandas as pd
import time
import base64
from datetime import datetime, date

# --- Imports internes ---
import config
from data.mock_data import MOCK_RESTAURANTS
from data.mock_tourist_sites import TOURIST_SITES
from scoring.engine import score_all_restaurants
from filters.restaurant_filter import apply_filters
from api.google_places import search_nearby
from db.models import init_db
from db.repository import save_reservation, log_consultation

# --- Init BDD (Phase 2 ready) ---
init_db()

# --- Chargement vidéo splash ---
try:
    with open("assets/localsignal-logo-animated.mp4", "rb") as f:
        splash_b64 = base64.b64encode(f.read()).decode()
except FileNotFoundError:
    splash_b64 = None

# --- Config page ---
st.set_page_config(page_title="Local Signal", page_icon="🍴", layout="centered")

# --- Design System CSS ---
st.markdown(f"""
<style>
body {{background-color:{config.BACKGROUND_COLOR};}}

/* --- Pills / Boutons de choix --- */
div[data-testid="stHorizontalBlock"] button {{
    border-radius: 50px !important;
    font-weight: bold !important;
    padding: 0.4em 1.2em !important;
    border: 2px solid {config.PRIMARY_COLOR} !important;
    background-color: {config.BACKGROUND_COLOR} !important;
    color: {config.PRIMARY_COLOR} !important;
    transition: all 0.2s ease;
}}
div[data-testid="stHorizontalBlock"] button:hover {{
    background-color: {config.PRIMARY_COLOR} !important;
    color: {config.BACKGROUND_COLOR} !important;
}}

/* --- Cartes restaurant --- */
.resto-card {{
    border: 1px solid #e0d8cc;
    border-radius: 12px;
    overflow: hidden;
    margin-bottom: 20px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    transition: transform 0.2s ease;
}}
.resto-card:hover {{
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(0,0,0,0.12);
}}
.resto-card img {{
    width: 100%;
    height: 220px;
    object-fit: cover;
}}
.resto-card .card-body {{
    padding: 16px;
    background-color: {config.CARD_INFO_BG};
    color: {config.PRIMARY_COLOR};
}}
.resto-card .card-body h3 {{
    margin: 0 0 8px 0;
    font-size: 1.2em;
}}
.resto-card .card-body .meta {{
    font-size: 0.9em;
    opacity: 0.85;
    margin-bottom: 8px;
}}
.resto-card .score-badge {{
    display: inline-block;
    background-color: {config.PRIMARY_COLOR};
    color: white;
    padding: 4px 12px;
    border-radius: 20px;
    font-weight: bold;
    font-size: 0.85em;
}}
.label-reservation {{
    position: absolute;
    top: 10px;
    left: 10px;
    background-color: {config.BACKGROUND_COLOR};
    color: {config.PRIMARY_COLOR};
    padding: 4px 10px;
    font-weight: bold;
    border-radius: 6px;
    font-size: 0.8em;
    box-shadow: 0 1px 4px rgba(0,0,0,0.15);
}}
.img-wrapper {{
    position: relative;
}}

/* --- Header / Logo --- */
.header-logo img {{
    max-width: 100%;
}}
</style>
""", unsafe_allow_html=True)


# --- Logo ---
def show_logo():
    try:
        st.image("assets/localsignal-logo-header.png", use_container_width=True)
    except Exception:
        st.title("🍴 Local Signal")


# --- Session State ---
defaults = {
    "page": "loading",
    "criteria": {},
    "selected_restaurant": None,
    "types_selected": [],
    "ambiance_selected": [],
    "lieu_selected": None,
    "selected_hour": None,
    "user_lat": 48.8566,   # Position par défaut : centre de Paris
    "user_lng": 2.3522,
}
for key, val in defaults.items():
    if key not in st.session_state:
        st.session_state[key] = val


# =========================================================================
# PAGE 1 : SPLASH SCREEN
# =========================================================================
if st.session_state.page == "loading":
    st.markdown("<div style='height: 60px'></div>", unsafe_allow_html=True)

    if splash_b64:
        st.markdown(f"""
        <div style="text-align:center;">
            <video width="280" autoplay loop muted playsinline>
                <source src="data:video/mp4;base64,{splash_b64}" type="video/mp4">
            </video>
        </div>
        """, unsafe_allow_html=True)
    else:
        st.markdown("<h1 style='text-align:center;'>🍴 Local Signal</h1>", unsafe_allow_html=True)

    my_bar = st.progress(0)
    for pct in range(100):
        time.sleep(0.008)
        my_bar.progress(pct + 1)

    st.markdown("<div style='height: 20px'></div>", unsafe_allow_html=True)
    col1, col2, col3 = st.columns([1, 2, 1])
    with col2:
        if st.button("🚀 Commencer", use_container_width=True):
            st.session_state.page = "hero"
            st.rerun()


# =========================================================================
# PAGE 2 : HERO — Formulaire de recherche
# =========================================================================
elif st.session_state.page == "hero":
    show_logo()
    st.markdown("---")
    st.subheader("🔍 Trouve des restaurants locaux")

    # --- Ville (single select) ---
    st.markdown("**📍 Lieu / Ville**")
    villes = ["Paris", "Lyon", "Marseille", "Bordeaux", "Nice"]
    cols = st.columns(len(villes))
    for i, ville in enumerate(villes):
        with cols[i]:
            if st.button(
                ville,
                key=f"ville_{ville}",
                type="primary" if st.session_state.lieu_selected == ville else "secondary",
            ):
                st.session_state.lieu_selected = ville
                st.rerun()

    st.markdown("")

    # --- Nombre de personnes ---
    personnes = st.slider("👥 Nombre de personnes", 1, 10, 2)

    # --- Type de nourriture (multi-select) ---
    st.markdown("**🍽️ Type de nourriture**")
    types_list = ["Italienne", "Japonaise", "Française", "Végétarienne", "Asiatique"]
    cols = st.columns(len(types_list))
    for i, t in enumerate(types_list):
        with cols[i]:
            is_selected = t in st.session_state.types_selected
            if st.button(
                t,
                key=f"type_{t}",
                type="primary" if is_selected else "secondary",
            ):
                if is_selected:
                    st.session_state.types_selected.remove(t)
                else:
                    st.session_state.types_selected.append(t)
                st.rerun()

    st.markdown("")

    # --- Ambiance (multi-select) ---
    st.markdown("**✨ Ambiance**")
    ambiance_list = ["Cosy", "Familial", "Romantique", "Moderne", "Rustique"]
    cols = st.columns(len(ambiance_list))
    for i, a in enumerate(ambiance_list):
        with cols[i]:
            is_selected = a in st.session_state.ambiance_selected
            if st.button(
                a,
                key=f"amb_{a}",
                type="primary" if is_selected else "secondary",
            ):
                if is_selected:
                    st.session_state.ambiance_selected.remove(a)
                else:
                    st.session_state.ambiance_selected.append(a)
                st.rerun()

    st.markdown("")

    # --- Budget ---
    budget = st.slider("💰 Budget (€ par personne)", 10, 100, (15, 60))

    # --- Bouton Recherche ---
    st.markdown("---")
    col1, col2, col3 = st.columns([1, 2, 1])
    with col2:
        if st.button("🔎 Trouver des restaurants", use_container_width=True, type="primary"):
            st.session_state.criteria = {
                "lieu": st.session_state.lieu_selected,
                "personnes": personnes,
                "types_nourriture": st.session_state.types_selected,
                "ambiance": st.session_state.ambiance_selected,
                "budget": budget,
            }
            st.session_state.page = "results"
            st.rerun()


# =========================================================================
# PAGE 3 : RÉSULTATS — Liste scorée et filtrée
# =========================================================================
elif st.session_state.page == "results":
    show_logo()
    st.markdown("---")

    # Récupération des restaurants (mock ou API)
    restaurants = search_nearby(st.session_state.user_lat, st.session_state.user_lng)

    # Application des filtres
    criteria = st.session_state.criteria
    filtered = apply_filters(restaurants, criteria)

    # Calcul du scoring
    scored = score_all_restaurants(
        filtered,
        user_lat=st.session_state.user_lat,
        user_lng=st.session_state.user_lng,
        tourist_sites=TOURIST_SITES,
    )

    st.subheader(f"📋 {len(scored)} restaurant(s) trouvé(s)")

    if not scored:
        st.info("Aucun restaurant trouvé pour ces critères. Essayez d'élargir votre recherche.")
    else:
        for resto in scored:
            scoring = resto["scoring"]

            # Chargement image
            try:
                with open(resto["image"], "rb") as f:
                    img_b64 = base64.b64encode(f.read()).decode()
                img_src = f"data:image/jpeg;base64,{img_b64}"
            except FileNotFoundError:
                img_src = "https://via.placeholder.com/400x220?text=Image+non+disponible"

            # Carte HTML
            reservation_label = (
                '<div class="label-reservation">✅ Réservation</div>'
                if resto.get("reservation") else ""
            )

            st.markdown(f"""
            <div class="resto-card">
                <div class="img-wrapper">
                    <img src="{img_src}" alt="{resto['name']}">
                    {reservation_label}
                </div>
                <div class="card-body">
                    <h3>{resto['name']}</h3>
                    <div class="meta">
                        {resto.get('type', '')} · {resto.get('ambiance', '')} · €{resto.get('price', '?')}/pers
                    </div>
                    <span class="score-badge">Score: {scoring['score_final']}/100</span>
                    <span style="font-size:0.75em; opacity:0.7; margin-left:8px;">
                        (Géo Tourist: {scoring['score_geo_tourist']:.2f} · Géo User: {scoring['score_geo_user']:.2f} · Langue: {scoring['score_language']})
                    </span>
                </div>
            </div>
            """, unsafe_allow_html=True)

            # Log consultation dans la BDD
            log_consultation(resto.get("id", ""), resto["name"], scoring["score_final"])

            # Bouton réservation
            if resto.get("reservation"):
                if st.button(f"📅 Réserver — {resto['name']}", key=f"btn_{resto['id']}"):
                    st.session_state.selected_restaurant = resto["id"]
                    st.session_state.page = "reservation"
                    st.rerun()

    st.markdown("---")
    if st.button("⬅️ Retour à la recherche"):
        st.session_state.page = "hero"
        st.rerun()


# =========================================================================
# PAGE 4 : RÉSERVATION
# =========================================================================
elif st.session_state.page == "reservation":
    show_logo()
    st.markdown("---")

    # Trouver le restaurant sélectionné
    restaurants = search_nearby(st.session_state.user_lat, st.session_state.user_lng)
    resto = next(
        (r for r in restaurants if r.get("id") == st.session_state.selected_restaurant),
        None,
    )

    if not resto:
        st.error("Restaurant non trouvé.")
        if st.button("⬅️ Retour"):
            st.session_state.page = "results"
            st.rerun()
    else:
        # Card rappel du restaurant
        try:
            with open(resto["image"], "rb") as f:
                img_b64 = base64.b64encode(f.read()).decode()
            img_src = f"data:image/jpeg;base64,{img_b64}"
        except FileNotFoundError:
            img_src = "https://via.placeholder.com/400x220?text=Image"

        st.markdown(f"""
        <div class="resto-card">
            <div class="img-wrapper">
                <img src="{img_src}" alt="{resto['name']}">
            </div>
            <div class="card-body">
                <h3>{resto['name']}</h3>
                <div class="meta">
                    {resto.get('type', '')} · {resto.get('ambiance', '')} · €{resto.get('price', '?')}/pers
                </div>
            </div>
        </div>
        """, unsafe_allow_html=True)

        st.subheader("📅 Réservation")

        # Formulaire
        col1, col2 = st.columns(2)
        with col1:
            nom = st.text_input("👤 Nom")
        with col2:
            email = st.text_input("📧 Email")

        personnes = st.slider("👥 Nombre de personnes", 1, 10, 2)
        date_selected = st.date_input("📆 Date", min_value=date.today())

        # Créneaux horaires
        st.markdown("**⏰ Choisir un créneau**")
        now_dt = datetime.now()

        horaires = resto.get("horaires", [("11:00", "14:30"), ("18:30", "22:00")])
        periods = [("Midi", horaires[0]), ("Soir", horaires[1])] if len(horaires) >= 2 else [("Midi", horaires[0])]

        for period_name, (start_str, end_str) in periods:
            st.markdown(f"**{period_name}**")
            slots = pd.date_range(
                f"{date_selected} {start_str}",
                f"{date_selected} {end_str}",
                freq="30min",
            ).time
            available_slots = [
                t.strftime("%H:%M") for t in slots
                if datetime.combine(date_selected, t) >= now_dt
            ]
            if available_slots:
                selected_hour = st.radio(
                    f"Créneau {period_name}",
                    available_slots,
                    index=(
                        available_slots.index(st.session_state.selected_hour)
                        if st.session_state.selected_hour in available_slots
                        else 0
                    ),
                    key=f"{period_name}_hour",
                    label_visibility="collapsed",
                )
                st.session_state.selected_hour = selected_hour
            else:
                st.caption(f"Aucun créneau {period_name.lower()} disponible pour cette date.")

        # Confirmation
        st.markdown("---")
        horaire_selection = st.session_state.get("selected_hour")

        col1, col2 = st.columns(2)
        with col1:
            if st.button("✅ Confirmer la réservation", type="primary", use_container_width=True):
                if not nom or not email:
                    st.warning("Veuillez remplir votre nom et email.")
                elif not horaire_selection:
                    st.warning("Veuillez sélectionner un créneau horaire.")
                else:
                    # Sauvegarde en BDD
                    reservation_id = save_reservation(
                        restaurant_id=resto.get("id", ""),
                        restaurant_name=resto["name"],
                        user_name=nom,
                        user_email=email,
                        num_persons=personnes,
                        date=str(date_selected),
                        time_slot=horaire_selection,
                    )
                    st.success(
                        f"🎉 Réservation #{reservation_id} confirmée !\n\n"
                        f"**{resto['name']}** — {date_selected} à {horaire_selection}\n\n"
                        f"{nom} · {personnes} personne(s)"
                    )
        with col2:
            if st.button("⬅️ Retour aux résultats", use_container_width=True):
                st.session_state.page = "results"
                st.rerun()

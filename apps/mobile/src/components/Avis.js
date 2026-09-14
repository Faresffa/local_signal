// apps/mobile/src/components/Avis.js
//
// Avis laissés par nos utilisateurs (D-039). Miroir de
// apps/web/src/components/Avis.jsx : mêmes textes, mêmes règles, même ordre.
//
// CE QUE CE BLOC NE FAIT PAS : peser sur le score. Ces avis sont stockés et
// affichés, rien de plus. Les faire compter reviendrait à réintroduire la
// popularité dans un classement construit pour s'en passer (D-001). La
// mention en bas le dit à l'utilisateur : un avis sans effet qu'on laisse
// croire influent est un mensonge poli.
//
// UN VISITEUR NON CONNECTÉ VOIT TOUT, MAIS N'ÉCRIT PAS. Le bouton reste
// visible ; le toucher l'emmène se connecter. Cacher le geste éviterait la
// demande de connexion, mais ne donnerait jamais de raison de créer un compte.

import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { fetchAvis, laisserAvis, retirerAvis } from "../api";
import { Button } from "./ui";
import { radius, spacing, useColors } from "../theme";

const MAX = 2000;

/** Date lisible. L'heure n'apporte rien sur un avis de restaurant. */
function quand(valeur) {
  if (!valeur) return "";
  const d = new Date(String(valeur).includes("T") ? valeur : `${valeur}Z`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * Cinq étoiles, touchables ou non.
 *
 * La note est facultative : un avis peut n'être que du texte. Toucher l'étoile
 * déjà sélectionnée retire la note — sur un téléphone, un bouton « effacer »
 * de plus encombrerait la ligne pour un geste rare.
 */
function Etoiles({ note, onChange, taille = 26 }) {
  const colors = useColors();
  const lecture = !onChange;

  return (
    <View style={s.etoiles}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          disabled={lecture}
          onPress={() => onChange(note === n ? null : n)}
          accessibilityRole={lecture ? "image" : "button"}
          accessibilityLabel={`${n} sur 5`}
          hitSlop={lecture ? 0 : 8}
          style={{ padding: lecture ? 0 : 3 }}
        >
          <Feather
            name="star"
            size={taille}
            color={n <= (note || 0) ? colors.mixed : colors.borderStrong}
          />
        </Pressable>
      ))}
    </View>
  );
}

function Carte({ avis, titre, mien }) {
  const colors = useColors();

  return (
    <View
      style={[
        s.carte,
        { borderTopColor: colors.border },
        mien && {
          backgroundColor: colors.surfaceAlt,
          borderWidth: 1,
          borderColor: colors.border,
          borderLeftWidth: 3,
          borderLeftColor: colors.brand,
          borderRadius: radius.sm,
          borderTopWidth: 1,
          padding: spacing.md,
          marginTop: spacing.md,
        },
      ]}
    >
      <View style={s.auteur}>
        <Feather name="user" size={17} color={colors.textMuted} />
        <View style={{ flex: 1 }}>
          <Text style={[s.auteurNom, { color: colors.text }]}>
            {titre || avis.author || "Voyageur"}
          </Text>
          <Text style={[s.date, { color: colors.textFaint }]}>
            {quand(avis.updated_at || avis.created_at)}
          </Text>
        </View>
      </View>

      {avis.rating ? <Etoiles note={avis.rating} taille={15} /> : null}
      {avis.text ? (
        <Text style={[s.corps, { color: colors.text }]}>{avis.text}</Text>
      ) : null}
    </View>
  );
}

export default function Avis({ restaurantId, user, onSeConnecter }) {
  const colors = useColors();

  const [etat, setEtat] = useState({ chargement: true, avis: [], leMien: null });
  const [ouvert, setOuvert] = useState(false);
  const [note, setNote] = useState(null);
  const [texte, setTexte] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);

  const charger = useCallback(async () => {
    try {
      const data = await fetchAvis(restaurantId);
      setEtat({ chargement: false, avis: data.avis ?? [], leMien: data.le_mien ?? null });
    } catch {
      // Un bloc d'avis qui ne charge pas ne casse pas la fiche : le restaurant
      // reste consultable, la section se tait.
      setEtat({ chargement: false, avis: [], leMien: null });
    }
  }, [restaurantId]);

  useEffect(() => { charger(); }, [charger]);

  // Le formulaire s'ouvre pré-rempli quand un avis existe : on modifie le
  // sien, on n'en empile pas un second (une seule ligne par personne en base).
  function ouvrir() {
    if (!user) { onSeConnecter?.(); return; }
    setNote(etat.leMien?.rating ?? null);
    setTexte(etat.leMien?.text ?? "");
    setErreur(null);
    setOuvert(true);
  }

  async function envoyer() {
    setErreur(null);
    setEnvoi(true);
    try {
      await laisserAvis(restaurantId, { rating: note, text: texte.trim() || null });
      await charger();
      setOuvert(false);
    } catch (err) {
      // 401 : la session a expiré entre l'affichage et l'envoi. Ce n'est pas
      // une panne, c'est une invitation à se reconnecter.
      if (err.status === 401) onSeConnecter?.();
      else setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  }

  async function retirer() {
    setEnvoi(true);
    try {
      await retirerAvis(restaurantId);
      await charger();
      setOuvert(false);
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  }

  const vide = !note && !texte.trim();
  const autres = etat.avis.filter((a) => a.id !== etat.leMien?.id);

  return (
    <View style={[s.bloc, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={s.tete}>
        <View style={s.titreLigne}>
          <Feather name="message-square" size={17} color={colors.text} />
          <Text style={[s.titre, { color: colors.text }]}>Avis des voyageurs</Text>
          {etat.avis.length > 0 && (
            <View style={[s.compte, { backgroundColor: colors.surfaceSunken }]}>
              <Text style={[s.compteTexte, { color: colors.textMuted }]}>
                {etat.avis.length}
              </Text>
            </View>
          )}
        </View>
      </View>

      {!ouvert && (
        <View style={{ marginTop: spacing.sm }}>
          <Button
            title={etat.leMien ? "Modifier mon avis" : "Laisser un avis"}
            icon={etat.leMien ? "edit-2" : "star"}
            variant="ghost"
            onPress={ouvrir}
          />
        </View>
      )}

      {!user && !ouvert && (
        <Text style={[s.invite, { color: colors.textMuted }]}>
          Connectez-vous pour laisser un avis — il restera modifiable et
          supprimable par vous seul.
        </Text>
      )}

      {ouvert && (
        <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
          <Etoiles note={note} onChange={setNote} />

          <TextInput
            value={texte}
            onChangeText={setTexte}
            maxLength={MAX}
            multiline
            placeholder="Ce que vous avez mangé, l'accueil, l'ambiance…"
            placeholderTextColor={colors.textFaint}
            style={[
              s.champ,
              { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.border },
            ]}
          />

          {/* Une note OU un texte suffit — le serveur applique la même règle.
              On le dit ici plutôt que de laisser découvrir le refus après
              avoir touché « publier ». */}
          {vide && (
            <Text style={[s.aide, { color: colors.textFaint }]}>
              Mettez une note, écrivez un mot, ou les deux.
            </Text>
          )}
          {erreur && <Text style={[s.erreur, { color: colors.brand }]}>{erreur}</Text>}

          <View style={{ gap: spacing.sm }}>
            <Button
              title={envoi ? "Envoi…" : etat.leMien ? "Enregistrer" : "Publier"}
              onPress={envoyer}
              disabled={envoi || vide}
            />
            <View style={s.secondaires}>
              <View style={{ flex: 1 }}>
                <Button title="Annuler" variant="ghost" onPress={() => setOuvert(false)} />
              </View>
              {etat.leMien && (
                <View style={{ flex: 1 }}>
                  <Button
                    title="Retirer"
                    icon="trash-2"
                    variant="ghost"
                    onPress={retirer}
                    disabled={envoi}
                  />
                </View>
              )}
            </View>
          </View>
        </View>
      )}

      {etat.leMien && !ouvert && (
        <Carte avis={etat.leMien} titre="Votre avis" mien />
      )}

      {autres.map((a) => <Carte avis={a} key={a.id} />)}

      {!etat.chargement && etat.avis.length === 0 && (
        <Text style={[s.vide, { color: colors.textMuted }]}>
          Aucun avis pour l'instant. Le vôtre serait le premier.
        </Text>
      )}

      {/* DIRE CE QUE L'AVIS FAIT, ET CE QU'IL NE FAIT PAS. */}
      <Text style={[s.mention, { color: colors.textFaint, borderTopColor: colors.border }]}>
        Ces avis ne modifient pas le score d'authenticité : celui-ci se calcule
        sur la carte, la langue des avis publics, les prix et l'emplacement. Un
        restaurant populaire n'est pas un restaurant local.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  bloc: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  tete: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  titreLigne: { flexDirection: "row", alignItems: "center", gap: 7, flex: 1 },
  titre: { fontSize: 16, fontWeight: "600" },
  compte: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
  compteTexte: { fontSize: 12, fontWeight: "600" },

  invite: { marginTop: spacing.sm, fontSize: 13, lineHeight: 18 },

  etoiles: { flexDirection: "row", alignItems: "center", gap: 2 },

  champ: {
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.md,
    minHeight: 96,
    fontSize: 15,
    lineHeight: 20,
    textAlignVertical: "top",
  },
  aide: { fontSize: 12, lineHeight: 17 },
  erreur: { fontSize: 13, lineHeight: 18 },
  secondaires: { flexDirection: "row", gap: spacing.sm },

  carte: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, gap: 7 },
  auteur: { flexDirection: "row", alignItems: "center", gap: 9 },
  auteurNom: { fontSize: 14, fontWeight: "600" },
  date: { fontSize: 12 },
  corps: { fontSize: 14, lineHeight: 20 },

  vide: { marginTop: spacing.md, fontSize: 14 },
  mention: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    fontSize: 12,
    lineHeight: 17,
  },
});

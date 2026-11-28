"""Tests für die reine Rechenlogik der Datenskripte in .github/scripts.

Die Skripte haben Bindestriche oder Unterstriche im Namen und sind kein Paket,
darum werden sie per Pfad geladen. Es gibt keinen Netzzugriff: getestet werden
nur Funktionen, die Daten umformen oder rechnen.
"""
import importlib.util
import os
import sys
import tempfile
import types
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

try:
    import requests  # noqa: F401
except ImportError:  # der Prüflauf hat requests nicht; die getesteten Funktionen brauchen es nicht
    sys.modules["requests"] = types.ModuleType("requests")

SKRIPTE = Path(__file__).resolve().parent.parent / ".github" / "scripts"


def lade(name):
    spec = importlib.util.spec_from_file_location(name, SKRIPTE / (name + ".py"))
    modul = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modul)
    return modul


agg = lade("compute_taostats_aggregates")
fng = lade("fetch_fear_and_greed_index")
top = lade("publish_top_history")
ath = lade("fetch_ath_atl")
kvf = lade("kv_fallback")
taostats = lade("fetch_taostats")
wallets = lade("fetch_top_wallets")


def verlauf(stunden, volumen=100.0, preis=10.0, schritt_std=1):
    """Verlauf mit einem Eintrag alle schritt_std Stunden, ältester zuerst."""
    ende = datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc)
    start = ende - timedelta(hours=stunden)
    out = []
    t = start
    while t <= ende:
        out.append({"_timestamp": t.isoformat().replace("+00:00", "Z"), "volume_24h": volumen, "price": preis})
        t += timedelta(hours=schritt_std)
    return out


class MittelwertTests(unittest.TestCase):
    def test_mean_leer_ist_null(self):
        self.assertEqual(agg.mean([]), 0.0)

    def test_mean(self):
        self.assertAlmostEqual(agg.mean([1, 2, 3, 4]), 2.5)

    def test_stddev_ein_wert_ist_null(self):
        self.assertEqual(agg.stddev([5]), 0.0)

    def test_stddev_bekannter_wert(self):
        self.assertAlmostEqual(agg.stddev([2, 4, 4, 4, 5, 5, 7, 9]), 2.0)

    def test_stddev_stichprobe(self):
        self.assertAlmostEqual(agg.stddev([1, 3], ddof=1), 2 ** 0.5)


class UmgebungswertTests(unittest.TestCase):
    def test_int_env_varianten(self):
        for modul in (agg, ath):
            with self.subTest(modul=modul.__name__):
                with mock.patch.dict(os.environ, {}, clear=False):
                    os.environ.pop("TESTWERT", None)
                    self.assertEqual(modul._int_env("TESTWERT", 7), 7)
                with mock.patch.dict(os.environ, {"TESTWERT": "  "}):
                    self.assertEqual(modul._int_env("TESTWERT", 7), 7)
                with mock.patch.dict(os.environ, {"TESTWERT": " 12 "}):
                    self.assertEqual(modul._int_env("TESTWERT", 7), 12)
                with mock.patch.dict(os.environ, {"TESTWERT": "abc"}):
                    self.assertEqual(modul._int_env("TESTWERT", 7), 7)


class AggregateTests(unittest.TestCase):
    def test_ohne_daten_kein_ergebnis(self):
        self.assertIsNone(agg.compute_aggregates(None))
        self.assertIsNone(agg.compute_aggregates([]))
        self.assertIsNone(agg.compute_aggregates("kein Verlauf"))

    def test_wenig_daten_geringe_sicherheit(self):
        a = agg.compute_aggregates(verlauf(6))
        self.assertEqual(a["confidence"], "low")
        self.assertIsNone(a["ma_3d"])
        self.assertIsNone(a["ma_7d"])

    def test_mittlere_und_hohe_sicherheit(self):
        self.assertEqual(agg.compute_aggregates(verlauf(30))["confidence"], "medium")
        self.assertEqual(agg.compute_aggregates(verlauf(80))["confidence"], "high")

    def test_gleichbleibendes_volumen_hat_keine_abweichung(self):
        a = agg.compute_aggregates(verlauf(200))
        self.assertAlmostEqual(a["ma_short"], 100.0)
        self.assertAlmostEqual(a["ma_3d"], 100.0)
        self.assertAlmostEqual(a["ma_7d"], 100.0)
        self.assertAlmostEqual(a["pct_change_vs_ma_short"], 0.0)
        self.assertEqual(a["last_price"], 10.0)

    def test_sprung_im_letzten_wert(self):
        v = verlauf(30)
        v[-1]["volume_24h"] = 400.0
        a = agg.compute_aggregates(v)
        self.assertGreater(a["pct_change_vs_ma_short"], 0.5)

    def test_unsortierter_verlauf_wird_nach_zeit_geordnet(self):
        v = verlauf(30)
        v[-1]["volume_24h"] = 900.0
        a = agg.compute_aggregates(list(reversed(v)))
        self.assertEqual(a["sample_timestamps"], sorted(a["sample_timestamps"]))
        self.assertGreater(a["pct_change_vs_ma_short"], 0)

    def test_fehlende_volumenwerte_zaehlen_als_null(self):
        v = verlauf(6)
        v[2]["volume_24h"] = None
        a = agg.compute_aggregates(v)
        self.assertIsNotNone(a)

    def test_preisaenderung_24h(self):
        v = verlauf(48)
        v[-1]["price"] = 11.0
        a = agg.compute_aggregates(v)
        self.assertIsNotNone(a["price_24h_pct"])
        self.assertAlmostEqual(a["price_24h_pct"], 10.0, delta=0.5)

    def test_stundenzahl_wird_gerundet_gemeldet(self):
        self.assertEqual(agg.compute_aggregates(verlauf(48))["hours_of_data"], 48.0)


def fng_eintrag(tage_her, wert):
    ts = int((datetime.now(timezone.utc) - timedelta(days=tage_her)).timestamp())
    return {"value": str(wert), "value_classification": "Neutral", "timestamp": str(ts)}


class FearAndGreedTests(unittest.TestCase):
    def test_leere_daten(self):
        self.assertIsNone(fng.parse_fng([]))
        self.assertIsNone(fng.parse_fng(None))

    def test_aktueller_wert_ist_der_neueste(self):
        daten = [fng_eintrag(30, 10), fng_eintrag(0, 55), fng_eintrag(7, 30), fng_eintrag(1, 40)]
        r = fng.parse_fng(daten)
        self.assertEqual(r["current"]["value"], "55")

    def test_naechster_wert_zu_gestern_woche_monat(self):
        daten = [fng_eintrag(0, 55), fng_eintrag(1, 40), fng_eintrag(7, 30), fng_eintrag(30, 10)]
        r = fng.parse_fng(daten)
        self.assertEqual(r["yesterday"]["value"], "40")
        self.assertEqual(r["last_week"]["value"], "30")
        self.assertEqual(r["last_month"]["value"], "10")

    def test_zeitstempel_gesetzt(self):
        r = fng.parse_fng([fng_eintrag(0, 50)])
        self.assertEqual(r["last_updated"], r["_timestamp"])
        datetime.fromisoformat(r["_timestamp"])


class TopListenTests(unittest.TestCase):
    def test_validatoren_verschachtelter_und_flacher_schluessel(self):
        daten = {"top_validators": [
            {"hotkey": {"ss58": "5ABCDEFGHIJK"}, "name": "Alpha", "stake": "1234.567"},
            {"hotkey": "5ZZZZZZZZZZZ", "stake": 5},
        ]}
        e = top.process_validators(daten)
        self.assertEqual(e[0], {"rank": 1, "id": "5ABCDEFGHIJK", "name": "Alpha", "value": 1234.57})
        self.assertEqual(e[1]["name"], "5ZZZZZZZ...")
        self.assertEqual(e[1]["rank"], 2)

    def test_validatoren_begrenzt_auf_zehn(self):
        daten = {"top_validators": [{"hotkey": "k%d" % i, "stake": i} for i in range(25)]}
        self.assertEqual(len(top.process_validators(daten)), 10)

    def test_validatoren_ungueltige_zahl_wird_null(self):
        e = top.process_validators({"top_validators": [{"hotkey": "x", "stake": "kaputt"}]})
        self.assertEqual(e[0]["value"], 0.0)

    def test_leere_antworten(self):
        for f in (top.process_validators, top.process_wallets, top.process_subnets, top.process_mcap, top.process_alpha_pressure):
            with self.subTest(f=f.__name__):
                self.assertEqual(f({}), [])

    def test_wallets_beide_schluesselnamen(self):
        a = top.process_wallets({"wallets": [{"address": "5ADDRESS12345", "balance_total": 10.123}]})
        b = top.process_wallets({"top_wallets": [{"address": "5ADDRESS12345", "total_balance": 10.123}]})
        self.assertEqual(a, b)
        self.assertEqual(a[0]["name"], "5ADDRESS...")
        self.assertEqual(a[0]["value"], 10.12)

    def test_subnetze_namen_und_ausgabe(self):
        e = top.process_subnets({"top_subnets": [
            {"netuid": 1, "taostats_name": "Apex", "estimated_emission_daily": "12.345"},
            {"netuid": 7, "emission": 3},
        ]})
        self.assertEqual(e[0]["name"], "Apex")
        self.assertEqual(e[0]["value"], 12.35)
        self.assertEqual(e[1]["name"], "SN7")
        self.assertEqual(e[1]["id"], "7")

    def test_marktkapitalisierung_wird_absteigend_sortiert(self):
        e = top.process_mcap({"subnets": [
            {"netuid": 1, "market_cap_tao": 5},
            {"netuid": 2, "market_cap_tao": 50, "name": "Zwei"},
            {"netuid": 3, "market_cap_tao": 20},
        ]})
        self.assertEqual([x["id"] for x in e], ["2", "3", "1"])
        self.assertEqual([x["rank"] for x in e], [1, 2, 3])
        self.assertEqual(e[0]["name"], "Zwei")


class BackupRotationTests(unittest.TestCase):
    def test_nur_die_neuesten_bleiben(self):
        alt = os.getcwd()
        with tempfile.TemporaryDirectory() as d:
            os.chdir(d)
            try:
                for i in range(1, 6):
                    Path("tao_ath_atl-2026110%d.json" % i).write_text("{}")
                Path("andere.json").write_text("{}")
                ath.rotate_backups(keep=2)
                rest = sorted(os.listdir("."))
            finally:
                os.chdir(alt)
        self.assertEqual([r for r in rest if r.startswith("tao_")], ["tao_ath_atl-20261104.json", "tao_ath_atl-20261105.json"])
        self.assertIn("andere.json", rest)


def mit_preis_und_volumen(preis_neu, volumen_neu):
    """48 Stunden Verlauf, nur der letzte Eintrag weicht ab."""
    v = verlauf(48)
    v[-1]["price"] = preis_neu
    v[-1]["volume_24h"] = volumen_neu
    return agg.compute_aggregates(v)


class VolumenSignalTests(unittest.TestCase):
    def test_signalfarben(self):
        faelle = [
            (11.0, 150.0, "green"),    # Volumen und Preis steigen
            (9.0, 150.0, "red"),       # Volumen steigt, Preis fällt
            (10.0, 150.0, "orange"),   # Volumen steigt, Preis stabil
            (11.0, 50.0, "yellow"),    # Volumen fällt, Preis steigt
            (9.0, 50.0, "yellow"),     # Volumen fällt, Preis fällt
            (10.0, 100.0, "neutral"),  # alles ruhig
        ]
        for preis, vol, erwartet in faelle:
            with self.subTest(preis=preis, vol=vol):
                self.assertEqual(mit_preis_und_volumen(preis, vol)["volume_signal"], erwartet)

    def test_ohne_24h_daten_kein_signal(self):
        self.assertIsNone(agg.compute_aggregates(verlauf(6))["volume_signal"])

    def test_trendrichtung(self):
        self.assertEqual(mit_preis_und_volumen(10.0, 100.0)["trend_direction"], "neutral")
        self.assertEqual(mit_preis_und_volumen(10.0, 300.0)["trend_direction"], "up")
        self.assertEqual(mit_preis_und_volumen(10.0, 30.0)["trend_direction"], "down")


class AlphaDruckTests(unittest.TestCase):
    def test_sortierung_nach_druck_und_rang(self):
        e = top.process_alpha_pressure({"subnets": [
            {"netuid": 1, "alpha_pressure_30d": 5.55, "net_flow_30d_tao": 100.4, "status": "ok"},
            {"netuid": 2, "name": "Zwei", "alpha_pressure_30d": -8, "net_flow_30d_tao": -50},
            {"netuid": 3, "alpha_pressure_30d": "kaputt"},
        ]})
        self.assertEqual([x["id"] for x in e], ["2", "3", "1"])
        self.assertEqual([x["rank"] for x in e], [1, 2, 3])
        self.assertEqual(e[0]["name"], "Zwei")
        self.assertEqual(e[0]["status"], "unknown")
        self.assertEqual(e[1]["pressure"], 0.0)
        self.assertEqual(e[2]["pressure"], 5.5)


class VerlaufAnhaengenTests(unittest.TestCase):
    def test_neuer_eintrag_wird_angehaengt(self):
        with mock.patch.object(top, "get_from_kv", return_value=[{"a": 1}]), \
                mock.patch.object(top, "put_to_kv", return_value=True) as put:
            self.assertTrue(top.append_to_history("schluessel", {"a": 2}))
        put.assert_called_once_with("schluessel", [{"a": 1}, {"a": 2}])

    def test_kein_verlauf_startet_neu(self):
        with mock.patch.object(top, "get_from_kv", return_value=None), \
                mock.patch.object(top, "put_to_kv", return_value=True) as put:
            top.append_to_history("k", {"x": 1})
        put.assert_called_once_with("k", [{"x": 1}])

    def test_kaputtes_format_wird_zurueckgesetzt(self):
        with mock.patch.object(top, "get_from_kv", return_value={"kein": "list"}), \
                mock.patch.object(top, "put_to_kv", return_value=True) as put:
            top.append_to_history("k", {"x": 1})
        put.assert_called_once_with("k", [{"x": 1}])

    def test_alte_eintraege_fallen_weg(self):
        alt = [{"i": i} for i in range(5)]
        with mock.patch.object(top, "MAX_HISTORY_ENTRIES", 3), \
                mock.patch.object(top, "get_from_kv", return_value=alt), \
                mock.patch.object(top, "put_to_kv", return_value=True) as put:
            top.append_to_history("k", {"i": 5})
        put.assert_called_once_with("k", [{"i": 3}, {"i": 4}, {"i": 5}])


class ApiAbrufTests(unittest.TestCase):
    def test_erfolg_liefert_json(self):
        antwort = mock.MagicMock()
        antwort.status = 200
        antwort.read.return_value = b'{"ok": true}'
        antwort.__enter__.return_value = antwort
        with mock.patch.object(top.urllib.request, "urlopen", return_value=antwort):
            self.assertEqual(top.fetch_api("/api/x"), {"ok": True})

    def test_fehler_liefert_none(self):
        with mock.patch.object(top.urllib.request, "urlopen", side_effect=OSError("kein Netz")):
            self.assertIsNone(top.fetch_api("/api/x"))

    def test_lokale_sicherung_wird_geschrieben(self):
        alt = os.getcwd()
        with tempfile.TemporaryDirectory() as d:
            os.chdir(d)
            try:
                top.write_local_backup("t.json", {"a": 1})
                text = Path(".github/data/t.json").read_text()
            finally:
                os.chdir(alt)
        self.assertIn('"a": 1', text)


class FngQuellenTests(unittest.TestCase):
    def test_erste_quelle_genuegt(self):
        with mock.patch.object(fng, "fetch_fng_alternative", return_value=([{"x": 1}], "alternative.me")):
            self.assertEqual(fng.fetch_fng()[1], "alternative.me")

    def test_ausweichquelle_cmc(self):
        with mock.patch.object(fng, "fetch_fng_alternative", side_effect=RuntimeError("aus")), \
                mock.patch.object(fng, "fetch_fng_cmc", return_value=([], "coinmarketcap")), \
                mock.patch.dict(os.environ, {"CMC_API_TOKEN": "x"}):
            self.assertEqual(fng.fetch_fng()[1], "coinmarketcap")

    def test_alle_quellen_ausgefallen(self):
        env = dict(os.environ)
        env.pop("CMC_API_TOKEN", None)
        with mock.patch.object(fng, "fetch_fng_alternative", side_effect=RuntimeError("aus")), \
                mock.patch.dict(os.environ, env, clear=True):
            with self.assertRaisesRegex(Exception, "All F&G sources failed"):
                fng.fetch_fng()


ZUGANG = {"CF_ACCOUNT_ID": "a", "CF_API_TOKEN": "t", "CF_METRICS_NAMESPACE_ID": "n"}


class FngHauptprogrammTests(unittest.TestCase):
    def test_ohne_zugangsdaten_endet_mit_fehler(self):
        env = {k: v for k, v in os.environ.items() if k not in ZUGANG}
        with mock.patch.dict(os.environ, env, clear=True), self.assertRaises(SystemExit) as r:
            fng.main()
        self.assertEqual(r.exception.code, 1)

    def test_erfolg_schreibt_mit_quelle(self):
        with mock.patch.dict(os.environ, ZUGANG), \
                mock.patch.object(fng, "fetch_fng", return_value=([fng_eintrag(0, 50)], "alternative.me")), \
                mock.patch.object(fng, "put_kv_json", return_value=True) as put:
            fng.main()
        gespeichert = put.call_args[0][4]
        self.assertEqual(put.call_args[0][3], "fear_and_greed_index")
        self.assertEqual(gespeichert["_source"], "alternative.me")

    def test_schreibfehler_endet_mit_fehler(self):
        with mock.patch.dict(os.environ, ZUGANG), \
                mock.patch.object(fng, "fetch_fng", return_value=([fng_eintrag(0, 50)], "x")), \
                mock.patch.object(fng, "put_kv_json", return_value=False), self.assertRaises(SystemExit):
            fng.main()

    def test_leere_daten_enden_mit_fehler(self):
        with mock.patch.dict(os.environ, ZUGANG), \
                mock.patch.object(fng, "fetch_fng", return_value=([], "x")), self.assertRaises(SystemExit):
            fng.main()


class FallbackTests(unittest.TestCase):
    """Der Ersatzweg darf die Frische der Daten nie vortäuschen (Sentinel prüft last_updated)."""

    def test_kv_fallback_laesst_last_updated_unveraendert(self):
        alt = "2026-11-16T19:14:00Z"
        antwort = mock.MagicMock()
        antwort.status = 200
        antwort.read.return_value = ('{"price": 1.0, "last_updated": "%s"}' % alt).encode()
        antwort.__enter__.return_value = antwort
        with mock.patch.object(kvf.urllib.request, "urlopen", return_value=antwort):
            daten = kvf.get_from_kv("acc", "tok", "ns", "taostats_latest")
        self.assertEqual(daten["last_updated"], alt)
        self.assertTrue(daten["_fallback_used"])
        self.assertEqual(daten["_cached_at"], alt)

    def _antwort_preis(self, last_updated):
        antwort = mock.MagicMock()
        antwort.status_code = 200
        antwort.json.return_value = {"pagination": {}, "data": [{"price": "184.5", "last_updated": last_updated}]}
        return antwort

    def test_taostats_frische_daten_werden_uebernommen(self):
        jetzt = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        with mock.patch.object(taostats, "TAOSTATS_API_KEY", "k"), \
                mock.patch.object(taostats.requests, "get", create=True, return_value=self._antwort_preis(jetzt)):
            ergebnis = taostats.fetch_taostats()
        self.assertEqual(ergebnis["price"], 184.5)
        self.assertEqual(ergebnis["last_updated"], jetzt)

    def test_taostats_veraltete_daten_gelten_als_fehler(self):
        alt = (datetime.now(timezone.utc) - timedelta(hours=30)).isoformat().replace("+00:00", "Z")
        with mock.patch.object(taostats, "TAOSTATS_API_KEY", "k"), \
                mock.patch.object(taostats.requests, "get", create=True, return_value=self._antwort_preis(alt)):
            self.assertIsNone(taostats.fetch_taostats())

    def test_taostats_url_ist_die_neue_v1(self):
        self.assertIn("/v1/price", taostats.TAOSTATS_URL)
        self.assertNotIn("/api/", taostats.TAOSTATS_URL)

    def test_wallets_adresse_als_text_und_objekt(self):
        zeile = {"rank": 1, "balance_total": "2000000000", "balance_free": "0", "balance_staked": "2000000000"}
        for adresse in ("5ABC", {"ss58": "5ABC"}):
            antwort = mock.MagicMock()
            antwort.json.return_value = {"data": [dict(zeile, address=adresse)]}
            with mock.patch.object(wallets, "TAOSTATS_API_KEY", "k"), \
                    mock.patch.object(wallets.requests, "get", create=True, return_value=antwort):
                liste = wallets.fetch_top_wallets(1)
            self.assertEqual(liste[0]["address"], "5ABC")
            self.assertEqual(liste[0]["balance_total"], 2.0)


if __name__ == "__main__":
    unittest.main()

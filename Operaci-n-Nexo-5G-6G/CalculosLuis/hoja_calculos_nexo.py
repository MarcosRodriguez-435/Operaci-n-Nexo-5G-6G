from pathlib import Path
import math

import pandas as pd


BASE_DIR = Path(__file__).resolve().parent

PARAMETROS = {
    "Frecuencia": 1800,
    "Ancho_banda": 20e6,
    "Potencia_TX": 43,
    "Ganancia_TX": 18,
    "Ganancia_RX": 0,
    "Perdidas_adicionales": 12,
    "Figura_ruido": 7,
    "Perdidas_implementacion": 2,
    "Grado_servicio": 0.02,
    "Canales_totales": 100,
    "Area_referencia_km2": 1.0,
}

ESCENARIOS = {
    "A": {
        "Entorno": "Urbano denso",
        "Modelo": "135 + 35 log10(d)",
        "Intercepto": 135,
        "Pendiente": 35,
        "SNR_req": 15,
        "Usuarios_activos": 2500,
        "Tasa_llamadas": 3,
        "Duracion": 2,
        "Sectores": 3,
        "Reutilizacion": [3, 4, 7],
        "Diseño": "3 sectores por celda y análisis de N = 3, 4 y 7",
    },
    "B": {
        "Entorno": "Suburbano / explanada abierta",
        "Modelo": "120 + 30 log10(d)",
        "Intercepto": 120,
        "Pendiente": 30,
        "SNR_req": 5,
        "Usuarios_activos": 8000,
        "Tasa_llamadas": 5,
        "Duracion": 1,
        "Sectores": 1,
        "Reutilizacion": [1],
        "Diseño": "Celdas omnidireccionales y evaluación de cell splitting",
    },
}


def erlang_b_blocking(canales, trafico):
    bloqueo = 1.0
    for canal in range(1, canales + 1):
        bloqueo = (trafico * bloqueo) / (canal + trafico * bloqueo)
    return bloqueo


def erlang_b_capacity(canales, grado_servicio):
    inferior = 0.0
    superior = max(1.0, canales * 2.0)

    while erlang_b_blocking(canales, superior) < grado_servicio:
        superior *= 2.0

    for _ in range(200):
        medio = (inferior + superior) / 2.0
        if erlang_b_blocking(canales, medio) > grado_servicio:
            superior = medio
        else:
            inferior = medio

    return (inferior + superior) / 2.0


def repartir_entero(total, partes):
    base = total // partes
    resto = total % partes
    return [base + 1 if indice < resto else base for indice in range(partes)]


def capacidad_celda(total_canales, sectores, grado_servicio):
    canales_sector = repartir_entero(total_canales, sectores)
    capacidades_sector = [erlang_b_capacity(canales, grado_servicio) for canales in canales_sector]
    return canales_sector, capacidades_sector, sum(capacidades_sector)


def radio_por_cobertura(intercepto, pendiente, perdida_maxima):
    return 10 ** ((perdida_maxima - intercepto) / pendiente)


def radio_por_capacidad(capacidad_celda_erlangs, densidad_trafico):
    area_maxima = capacidad_celda_erlangs / densidad_trafico
    return math.sqrt(area_maxima / math.pi), area_maxima


def metricas_base_escenario(datos_escenario):
    ruido = -174 + 10 * math.log10(PARAMETROS["Ancho_banda"]) + PARAMETROS["Figura_ruido"]
    sensibilidad = ruido + datos_escenario["SNR_req"] + PARAMETROS["Perdidas_implementacion"]
    perdida_maxima = (
        PARAMETROS["Potencia_TX"]
        + PARAMETROS["Ganancia_TX"]
        + PARAMETROS["Ganancia_RX"]
        - sensibilidad
        - PARAMETROS["Perdidas_adicionales"]
    )
    radio_cobertura = radio_por_cobertura(
        datos_escenario["Intercepto"],
        datos_escenario["Pendiente"],
        perdida_maxima,
    )
    trafico_usuario = datos_escenario["Tasa_llamadas"] * (datos_escenario["Duracion"] / 60)
    densidad_trafico = datos_escenario["Usuarios_activos"] * trafico_usuario

    return {
        "Ruido_termico_dBm": ruido,
        "Sensibilidad_dBm": sensibilidad,
        "Perdida_maxima_dB": perdida_maxima,
        "Radio_cobertura_km": radio_cobertura,
        "Trafico_usuario_Erl": trafico_usuario,
        "Densidad_trafico_Erl_km2": densidad_trafico,
    }


def analizar_escenario_a(metricas):
    filas = []
    comparacion = []
    interferencia = []
    area_referencia = PARAMETROS["Area_referencia_km2"]

    for reutilizacion in ESCENARIOS["A"]["Reutilizacion"]:
        canales_celda = repartir_entero(PARAMETROS["Canales_totales"], reutilizacion)
        detalle_celdas = []
        capacidades = []

        for indice, canales in enumerate(canales_celda, start=1):
            canales_sector, capacidades_sector, capacidad_total = capacidad_celda(
                canales,
                ESCENARIOS["A"]["Sectores"],
                PARAMETROS["Grado_servicio"],
            )
            capacidades.append(capacidad_total)
            detalle_celdas.append(
                f"C{indice}: {canales} canales -> sectores {canales_sector[0]}-{canales_sector[1]}-{canales_sector[2]}"
            )

        capacidad_media = sum(capacidades) / len(capacidades)
        radio_capacidad, area_capacidad = radio_por_capacidad(
            capacidad_media,
            metricas["Densidad_trafico_Erl_km2"],
        )
        celdas_por_km2 = math.ceil(area_referencia / area_capacidad)
        reuse_ratio = math.sqrt(3 * reutilizacion)

        filas.append(
            {
                "N": reutilizacion,
                "Detalle canales por celda": " | ".join(detalle_celdas),
                "Capacidad media por celda (Erl)": round(capacidad_media, 3),
                "Area maxima por capacidad (km2)": round(area_capacidad, 4),
                "Radio por capacidad (km)": round(radio_capacidad, 3),
                "Celdas necesarias en 1 km2": celdas_por_km2,
            }
        )
        interferencia.append(
            {
                "N": reutilizacion,
                "Reuse ratio D/R": round(reuse_ratio, 3),
                "Capacidad media por celda (Erl)": round(capacidad_media, 3),
                "Radio por capacidad (km)": round(radio_capacidad, 3),
            }
        )
        comparacion.append(
            {
                "Escenario": f"A (N={reutilizacion})",
                "Radio cobertura (km)": round(metricas["Radio_cobertura_km"], 3),
                "Radio capacidad (km)": round(radio_capacidad, 3),
                "Radio diseño (km)": round(min(metricas["Radio_cobertura_km"], radio_capacidad), 3),
                "Limitante": "Capacidad" if radio_capacidad < metricas["Radio_cobertura_km"] else "Cobertura",
            }
        )

    return pd.DataFrame(filas), pd.DataFrame(interferencia), comparacion


def analizar_escenario_b(metricas):
    capacidad = erlang_b_capacity(PARAMETROS["Canales_totales"], PARAMETROS["Grado_servicio"])
    radio_capacidad, area_capacidad = radio_por_capacidad(capacidad, metricas["Densidad_trafico_Erl_km2"])
    area_macro = math.pi * metricas["Radio_cobertura_km"] ** 2
    factor_splitting = area_macro / area_capacidad

    comparacion = {
        "Escenario": "B",
        "Radio cobertura (km)": round(metricas["Radio_cobertura_km"], 3),
        "Radio capacidad (km)": round(radio_capacidad, 3),
        "Radio diseño (km)": round(min(metricas["Radio_cobertura_km"], radio_capacidad), 3),
        "Limitante": "Capacidad" if radio_capacidad < metricas["Radio_cobertura_km"] else "Cobertura",
    }

    cell_splitting = pd.DataFrame(
        [
            {
                "Capacidad omnidireccional (Erl)": round(capacidad, 3),
                "Area macro por cobertura (km2)": round(area_macro, 3),
                "Area micro por capacidad (km2)": round(area_capacidad, 4),
                "Microceldas equivalentes por macrocelda": math.ceil(factor_splitting),
                "Factor de splitting teorico": round(factor_splitting, 2),
            }
        ]
    )

    return comparacion, cell_splitting


def guardar_csv(nombre, dataframe):
    dataframe.to_csv(BASE_DIR / nombre, index=False)


def main():
    metricas_a = metricas_base_escenario(ESCENARIOS["A"])
    metricas_b = metricas_base_escenario(ESCENARIOS["B"])

    df_parametros = pd.DataFrame(
        [
            {"Parámetro": clave, "Valor": valor}
            for clave, valor in PARAMETROS.items()
            if clave != "Area_referencia_km2"
        ]
    )
    df_escenarios = pd.DataFrame(
        [
            {
                "Escenario": clave,
                "Entorno": datos["Entorno"],
                "Modelo": datos["Modelo"],
                "SNR_req (dB)": datos["SNR_req"],
                "Usuarios/km²": datos["Usuarios_activos"],
                "Tasa llamadas/h": datos["Tasa_llamadas"],
                "Duración (min)": datos["Duracion"],
                "Diseño": datos["Diseño"],
            }
            for clave, datos in ESCENARIOS.items()
        ]
    )
    df_metricas = pd.DataFrame(
        [
            {
                "Escenario": "A",
                **{k: round(v, 3) for k, v in metricas_a.items()},
            },
            {
                "Escenario": "B",
                **{k: round(v, 3) for k, v in metricas_b.items()},
            },
        ]
    )

    df_capacidades_a, df_interferencia_a, comparacion_a = analizar_escenario_a(metricas_a)
    comparacion_b, df_cell_splitting = analizar_escenario_b(metricas_b)
    df_comparacion = pd.DataFrame(comparacion_a + [comparacion_b])

    guardar_csv("parametros.csv", df_parametros)
    guardar_csv("escenarios.csv", df_escenarios)
    guardar_csv("metricas_escenario.csv", df_metricas)
    guardar_csv("capacidades_A.csv", df_capacidades_a)
    guardar_csv("interferencia_A.csv", df_interferencia_a)
    guardar_csv("comparacion_final.csv", df_comparacion)
    guardar_csv("cell_splitting_B.csv", df_cell_splitting)

    print("Resultados corregidos")
    print(df_metricas.to_string(index=False))
    print("\nCapacidades escenario A")
    print(df_capacidades_a.to_string(index=False))
    print("\nComparación final")
    print(df_comparacion.to_string(index=False))
    print("\nCell splitting escenario B")
    print(df_cell_splitting.to_string(index=False))


if __name__ == "__main__":
    main()

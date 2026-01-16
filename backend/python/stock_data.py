#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pykrx를 활용한 주식 수급/공매도 데이터 수집기
Usage:
    python stock_data.py <command> <stock_code> [options]

Commands:
    investor    - 투자자별 매매동향 (외국인/기관/개인)
    short       - 공매도 데이터
    program     - 프로그램 매매
    fundamental - 기본 재무지표 (PER, PBR 등)
    all         - 모든 데이터 통합 조회
    bulk        - 여러 종목 일괄 조회 (stdin으로 코드 목록 입력)
"""

import sys
import json
from datetime import datetime, timedelta

try:
    from pykrx import stock
except ImportError:
    print(json.dumps({"error": "pykrx not installed. Run: pip install pykrx"}))
    sys.exit(1)


def get_investor_data(code: str, days: int = 5) -> dict:
    """
    투자자별 매매동향 조회
    Returns: 외국인/기관/개인 순매수 (당일, 5일합계)
    """
    try:
        today = datetime.now().strftime("%Y%m%d")
        start_date = (datetime.now() - timedelta(days=days + 10)).strftime("%Y%m%d")

        df = stock.get_market_trading_value_by_date(start_date, today, code)

        if df is None or df.empty:
            return None

        # 최근 거래일 데이터 (영업일 기준)
        df = df.tail(days)

        if df.empty:
            return None

        latest = df.iloc[-1]

        # 억원 단위로 변환
        foreign_net = int(latest.get("외국인순매수", 0)) // 100000000
        inst_net = int(latest.get("기관합계", latest.get("기관순매수", 0))) // 100000000
        retail_net = int(latest.get("개인순매수", latest.get("개인", 0))) // 100000000

        # 5일 합계
        foreign_5d = int(df["외국인순매수"].sum()) // 100000000 if "외국인순매수" in df else 0
        inst_col = "기관합계" if "기관합계" in df else "기관순매수"
        inst_5d = int(df[inst_col].sum()) // 100000000 if inst_col in df else 0

        return {
            "foreignNet": foreign_net,        # 외국인 당일 순매수 (억원)
            "institutionNet": inst_net,       # 기관 당일 순매수 (억원)
            "retailNet": retail_net,          # 개인 당일 순매수 (억원)
            "foreignNet5d": foreign_5d,       # 외국인 5일 합계 (억원)
            "institutionNet5d": inst_5d,      # 기관 5일 합계 (억원)
            "dataDate": df.index[-1].strftime("%Y-%m-%d") if hasattr(df.index[-1], 'strftime') else str(df.index[-1])
        }
    except Exception as e:
        return {"error": str(e)}


def get_short_data(code: str, days: int = 5) -> dict:
    """
    공매도 데이터 조회
    Returns: 공매도량, 공매도비중, 잔고비중
    """
    try:
        today = datetime.now().strftime("%Y%m%d")
        start_date = (datetime.now() - timedelta(days=days + 10)).strftime("%Y%m%d")

        df = stock.get_shorting_volume_by_date(start_date, today, code)

        if df is None or df.empty:
            return None

        df = df.tail(days)

        if df.empty:
            return None

        latest = df.iloc[-1]

        short_volume = int(latest.get("공매도량", 0))
        total_volume = int(latest.get("총거래량", 1))
        short_ratio = float(latest.get("공매도비중", 0)) if "공매도비중" in latest else (short_volume / total_volume * 100 if total_volume > 0 else 0)

        # 5일 평균
        avg_short_ratio = float(df["공매도비중"].mean()) if "공매도비중" in df else 0

        return {
            "shortVolume": short_volume,           # 공매도량 (주)
            "shortRatio": round(short_ratio, 2),   # 공매도비중 (%)
            "shortRatioAvg5d": round(avg_short_ratio, 2),  # 5일 평균 공매도비중 (%)
            "dataDate": df.index[-1].strftime("%Y-%m-%d") if hasattr(df.index[-1], 'strftime') else str(df.index[-1])
        }
    except Exception as e:
        return {"error": str(e)}


def get_program_data(code: str) -> dict:
    """
    프로그램 매매 데이터 조회
    """
    try:
        today = datetime.now().strftime("%Y%m%d")
        start_date = (datetime.now() - timedelta(days=15)).strftime("%Y%m%d")

        df = stock.get_market_net_purchases_of_equities_by_ticker(start_date, today, "KOSPI")

        if df is None or df.empty:
            return None

        if code in df.index:
            row = df.loc[code]
            return {
                "programBuy": int(row.get("순매수거래량", 0)),
                "programNetBuy": int(row.get("순매수거래대금", 0)) // 100000000
            }

        return None
    except Exception as e:
        return {"error": str(e)}


def get_fundamental_data(code: str) -> dict:
    """
    기본 재무지표 조회 (PER, PBR, 배당수익률)
    """
    try:
        today = datetime.now().strftime("%Y%m%d")
        start_date = (datetime.now() - timedelta(days=10)).strftime("%Y%m%d")

        df = stock.get_market_fundamental_by_date(start_date, today, code)

        if df is None or df.empty:
            return None

        latest = df.iloc[-1]

        return {
            "per": round(float(latest.get("PER", 0)), 2),
            "pbr": round(float(latest.get("PBR", 0)), 2),
            "eps": int(latest.get("EPS", 0)),
            "bps": int(latest.get("BPS", 0)),
            "div": round(float(latest.get("DIV", 0)), 2),  # 배당수익률
            "dataDate": df.index[-1].strftime("%Y-%m-%d") if hasattr(df.index[-1], 'strftime') else str(df.index[-1])
        }
    except Exception as e:
        return {"error": str(e)}


def get_all_data(code: str) -> dict:
    """모든 데이터 통합 조회"""
    result = {
        "code": code,
        "timestamp": datetime.now().isoformat()
    }

    investor = get_investor_data(code)
    if investor and "error" not in investor:
        result["investor"] = investor

    short = get_short_data(code)
    if short and "error" not in short:
        result["short"] = short

    fundamental = get_fundamental_data(code)
    if fundamental and "error" not in fundamental:
        result["fundamental"] = fundamental

    return result


def bulk_query(codes: list) -> list:
    """여러 종목 일괄 조회"""
    results = []
    for code in codes:
        code = code.strip()
        if code:
            data = get_all_data(code)
            results.append(data)
    return results


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python stock_data.py <command> [stock_code]"}))
        sys.exit(1)

    command = sys.argv[1].lower()

    if command == "bulk":
        # stdin에서 종목 코드 목록 읽기
        codes = sys.stdin.read().strip().split('\n')
        result = bulk_query(codes)
    elif len(sys.argv) < 3:
        print(json.dumps({"error": "Stock code required"}))
        sys.exit(1)
    else:
        code = sys.argv[2]

        if command == "investor":
            result = get_investor_data(code)
        elif command == "short":
            result = get_short_data(code)
        elif command == "program":
            result = get_program_data(code)
        elif command == "fundamental":
            result = get_fundamental_data(code)
        elif command == "all":
            result = get_all_data(code)
        else:
            result = {"error": f"Unknown command: {command}"}

    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

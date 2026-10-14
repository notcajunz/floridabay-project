from pathlib import Path

import pytest

from businessbot.database import Database
from businessbot.services import BusinessService, InsufficientFunds, deduct_fee, parse_color


@pytest.fixture
async def service(tmp_path: Path):
    db = Database(tmp_path / "test.db")
    await db.connect()
    yield BusinessService(db)
    await db.close()


async def test_create_and_transfer_assets(service: BusinessService):
    await service.create(1, "Vagos", "street", tier=2)
    await service.create(1, "Lost MC", "mc", tier=1)
    assert await service.change_balance(1, "Vagos", "cash", 5_000, "seed", 99) == 5_000

    await service.transfer(1, "Vagos", "Lost MC", "cash", 1_250, "deal", 99)

    vagos = await service.business(1, "Vagos")
    lost = await service.business(1, "Lost MC")
    assert vagos["cash"] == 3_750
    assert lost["cash"] == 1_250
    ledger = await service.db.fetch_all("SELECT delta FROM ledger ORDER BY id")
    assert [row["delta"] for row in ledger] == [5_000, -1_250, 1_250]


async def test_cannot_overdraw(service: BusinessService):
    await service.create(1, "Families", "street")
    with pytest.raises(InsufficientFunds):
        await service.change_balance(1, "Families", "cash", -1, "bad", 99)


async def test_transfer_fee_reduces_received_asset(service: BusinessService):
    await service.create(1, "A", "street")
    await service.create(1, "B", "street")
    await service.change_balance(1, "A", "cash", 1_000, "seed", 99)
    await service.transfer(1, "A", "B", "cash", 400, "deal", 99, fee_rate=0.10)
    assert (await service.business(1, "A"))["cash"] == 600
    assert (await service.business(1, "B"))["cash"] == 360


def test_parse_color():
    assert parse_color("#5865F2") == 0x5865F2
    assert parse_color("0xff0000") == 0xFF0000
    with pytest.raises(ValueError):
        parse_color("1000000")


def test_fee_is_deducted_from_received_amount():
    assert deduct_fee(1_000, 0.15) == (850, 150)
    assert deduct_fee(3, 0.10) == (3, 0)

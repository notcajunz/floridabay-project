from gangbot.config import AccessRule, Config


def test_command_access_precedence(tmp_path):
    config = Config(
        "unused",
        tmp_path / "test.db",
        None,
        frozenset({1}),
        10,
        command_access={
            "bank *": AccessRule("denylist", roles=frozenset({20})),
            "bank give": AccessRule("allowlist", users=frozenset({2})),
        },
    )
    assert config.access_decision("bank give", 2, set()) is True
    assert config.access_decision("bank give", 3, set()) is False
    assert config.access_decision("bank info", 3, {20}) is False
    assert config.access_decision("bank info", 3, {30}) is True
    assert config.access_decision("leaderboard", 3, set()) is None
    assert config.access_decision("bank give", 1, set()) is True


def test_permission_categories_expand_and_exact_rules_override(tmp_path, monkeypatch):
    path = tmp_path / "config.toml"
    path.write_text(
        """
[access]
administrators_bypass = false
owners_bypass = false

[access.categories.bank]
mode = "allowlist"
users = [2]
roles = []
commands = ["bank give", "bank info"]

[access.commands."bank info"]
mode = "denylist"
users = [2]
roles = []
""",
        encoding="utf-8",
    )
    monkeypatch.setenv("DISCORD_TOKEN", "test")
    monkeypatch.setenv("CONFIG_PATH", str(path))
    config = Config.from_env()
    assert config.access_decision("bank give", 2, set()) is True
    assert config.access_decision("bank give", 3, set()) is False
    assert config.access_decision("bank info", 2, set()) is False
    assert config.access_decision("bank info", 3, set()) is True

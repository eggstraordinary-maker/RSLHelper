"""Guard the architecture of migrated scenarios, not their implementation text."""

import ast
from pathlib import Path

import pytest

APP = Path(__file__).parents[1] / "app"
MODULES = {"accounts", "catalog", "learning"}


def syntax(path):
    return ast.parse(path.read_text(encoding="utf-8-sig"), filename=str(path))


@pytest.mark.parametrize("name", ["auth", "users", "admin", "progress"])
def test_migrated_routers_have_no_sql_or_orm_queries(name):
    tree = syntax(APP / "routers" / f"{name}.py")
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            assert node.module != "app.models"
            if node.module == "app":
                assert all(alias.name != "models" for alias in node.names)
            if node.module and node.module.startswith("sqlalchemy"):
                assert node.module == "sqlalchemy.ext.asyncio" and all(
                    alias.name == "AsyncSession" for alias in node.names
                )
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            if isinstance(node.func.value, ast.Name) and node.func.value.id == "db":
                assert node.func.attr not in {
                    "execute",
                    "scalar",
                    "scalars",
                    "commit",
                    "add",
                    "delete",
                    "flush",
                }
        if isinstance(node, ast.Import):
            assert all(
                not alias.name.startswith(("sqlalchemy", "app.models"))
                for alias in node.names
            )


def test_module_services_do_not_depend_on_http_or_other_module_internals():
    for owner in MODULES:
        for path in (APP / "modules" / owner).glob("*.py"):
            for node in ast.walk(syntax(path)):
                if isinstance(node, ast.ImportFrom):
                    source = node.module or ""
                    assert not source.startswith(("fastapi", "app.routers")), str(path)
                    if source.startswith("app.modules."):
                        parts = source.split(".")
                        if parts[2] != owner:
                            assert parts[3:4] in (["public"], ["dto"]) or (
                                len(parts) == 3
                                and all(
                                    alias.name in {"public", "dto"}
                                    for alias in node.names
                                )
                            ), str(path)
                elif isinstance(node, ast.Import):
                    for alias in node.names:
                        assert not alias.name.startswith(("fastapi", "app.routers"))
                        if alias.name.startswith("app.modules."):
                            parts = alias.name.split(".")
                            assert parts[2] == owner or parts[3:4] in (
                                ["public"],
                                ["dto"],
                            )


def test_repositories_do_not_own_transaction_commits():
    for name in MODULES:
        for node in ast.walk(syntax(APP / "modules" / name / "repository.py")):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
                assert node.func.attr not in {"commit", "rollback"}


def test_compatibility_shims_are_retired_from_runtime():
    assert not (APP / "crud.py").exists()
    assert not (APP / "services" / "progress.py").exists()
    for path in APP.rglob("*.py"):
        for node in ast.walk(syntax(path)):
            if isinstance(node, ast.ImportFrom):
                assert node.module not in {"app.crud", "app.services.progress"}
                if node.module == "app":
                    assert all(alias.name != "crud" for alias in node.names)
            elif isinstance(node, ast.Import):
                assert all(
                    alias.name not in {"app.crud", "app.services.progress"}
                    for alias in node.names
                )

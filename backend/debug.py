import sys
import traceback


def test_imports():
    modules = [
        'fastapi',
        'sqlalchemy',
        'pydantic',
        'jose',
        'passlib',
        'aiosqlite',
        'asyncpg'
    ]

    for module in modules:
        try:
            __import__(module)
            print(f"✅ {module}")
        except ImportError as e:
            print(f"❌ {module}: {e}")


def test_database():
    try:
        from sqlalchemy import create_engine
        from sqlalchemy.ext.declarative import declarative_base
        from sqlalchemy.orm import sessionmaker

        engine = create_engine("sqlite:///:memory:")
        Base = declarative_base()
        Session = sessionmaker(bind=engine)

        print("✅ Database modules work")
    except Exception as e:
        print(f"❌ Database error: {e}")
        traceback.print_exc()


if __name__ == "__main__":
    print("Python:", sys.version)
    print("\nTesting imports...")
    test_imports()
    print("\nTesting database...")
    test_database()
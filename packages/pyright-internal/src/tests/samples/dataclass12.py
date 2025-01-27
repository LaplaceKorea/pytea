# This sample tests the case where an inheritance chain of
# dataclasses use generic types.

from dataclasses import dataclass
from typing import Generic, Literal, TypeVar

Key0 = TypeVar("Key0")
Key1 = TypeVar("Key1")
Key2 = TypeVar("Key2")
Value = TypeVar("Value")


@dataclass
class MapTreeLeaf(Generic[Key0, Value]):
    key: Key0
    value: Value


@dataclass
class MapTreeNode(MapTreeLeaf[Key1, Value]):
    pass


class Foo(Generic[Key2, Value]):
    def add(self, key: Key2, value: Value):
        return MapTreeNode(key=key, value=value)

    def test1(self, a: Key2, b: Value):
        v1 = self.add(a, b)
        t1: Literal["MapTreeNode[Key2@Foo, Value@Foo]"] = reveal_type(v1)
        t1_key: Literal["Key2@Foo"] = reveal_type(v1.key)
        t1_value: Literal["Value@Foo"] = reveal_type(v1.value)

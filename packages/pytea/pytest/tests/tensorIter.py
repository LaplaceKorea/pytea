import torch
from torchvision import datasets
import torchvision.transforms as transforms
from sklearn.model_selection import train_test_split

dataroot = "../../../data"

transform = transforms.Compose(
    [transforms.ToTensor(), lambda x: torch.reshape(x, (784,)),]
)

# mnist = datasets.CIFAR10(root=dataroot, train=True, transform=None, download=True)
train_set, valid_set = train_test_split(
    datasets.MNIST(root=dataroot, train=True, transform=transform, download=True),
    test_size=0.1,
)

t = torch.rand(7, 3, 4)
t0 = 1
t1 = 1
arr = []
"""
for array in mnist:
    t0 = array
    t1 = t0[1]
    arr.append(array)
"""

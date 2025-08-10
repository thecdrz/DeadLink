#!/bin/sh
# Auto-restart
{
  echo "Launching... Use \"screen -r discord7dtd\" to access the terminal and ctrl+a+d to exit the terminal."
  screen -dmS discord7dtd ./run.sh
} || {
  read -p "Failed to launch, see log above. Please make sure that \"screen\" is installed on your system. Press enter to exit."
}
